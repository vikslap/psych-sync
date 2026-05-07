import { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";
import {
  Users,
  PlayCircle,
  Send,
  Trophy,
  Star,
  Clock,
  LogIn,
  ChevronRight,
  XCircle,
  LogOut,
  UploadCloud,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function App() {
  // --- 1. State ---
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [player, setPlayer] = useState(null);
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [question, setQuestion] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [bluff, setBluff] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [selectedVote, setSelectedVote] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // Host Lobby Settings
  const [setRounds, setSetRounds] = useState(5);
  const [setBluffers, setSetBluffers] = useState(1);
  const [setVoteTime, setSetVoteTime] = useState(30);
  const [setRevealTime, setSetRevealTime] = useState(15);
  const [isAuto, setIsAuto] = useState(true);

  // --- 2. Action Logic ---
  const leaveRoom = () => {
    if (!window.confirm("Leave this room and return to main menu?")) return;
    localStorage.removeItem("psych_player_id");
    window.location.reload();
  };

  const resetSession = async () => {
    if (!window.confirm("Reset all scores and return to lobby?")) return;
    await supabase
      .from("rooms")
      .update({
        status: "lobby",
        current_round: 0,
        phase_ends_at: null,
      })
      .eq("id", room.id);
    await supabase
      .from("players")
      .update({
        score: 0,
        last_vote_id: null,
        is_active_bluffer: false,
      })
      .eq("room_id", room.id);
    await supabase.from("submissions").delete().eq("room_id", room.id);
  };

  const createRoom = async () => {
    if (!name.trim()) return;
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const { data: nr } = await supabase
      .from("rooms")
      .insert([
        {
          code,
          status: "lobby",
          bluffer_count: setBluffers,
          max_rounds: setRounds,
          voting_duration: setVoteTime,
          reveal_duration: setRevealTime,
          auto_advance: isAuto,
        },
      ])
      .select()
      .single();
    const { data: np } = await supabase
      .from("players")
      .insert([{ name: name.toUpperCase(), room_id: nr.id, is_host: true }])
      .select()
      .single();
    localStorage.setItem("psych_player_id", np.id);
    setRoom(nr);
    setPlayer(np);
  };

  const joinRoom = async () => {
    if (!name.trim() || !roomCode.trim()) return;
    const { data: tr } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", roomCode)
      .single();
    if (!tr) return alert("Room not found!");
    const { data: np } = await supabase
      .from("players")
      .insert([{ name: name.toUpperCase(), room_id: tr.id }])
      .select()
      .single();
    localStorage.setItem("psych_player_id", np.id);
    setRoom(tr);
    setPlayer(np);
  };

  const handleJsonUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        const formatted = json.map((q) => ({
          content: q.content,
          answer: q.answer.toUpperCase(),
          room_id: room.id,
        }));
        await supabase.from("questions").insert(formatted);
        alert(`Loaded ${formatted.length} custom questions!`);
      } catch (err) {
        alert("Invalid JSON format.");
      }
    };
    reader.readAsText(file);
  };

  const clearCustomDeck = async () => {
    if (!window.confirm("Delete all custom questions for this room?")) return;
    await supabase.from("questions").delete().eq("room_id", room.id);
    alert("Custom deck cleared!");
  };

  const startGame = async () => {
    const { data: latestPs } = await supabase
      .from("players")
      .select("id")
      .eq("room_id", room.id);
    let { data: qs } = await supabase
      .from("questions")
      .select("*")
      .eq("room_id", room.id);
    if (!qs || qs.length === 0) {
      const { data: defQs } = await supabase
        .from("questions")
        .select("*")
        .is("room_id", null);
      qs = defQs;
    }
    const q = qs[Math.floor(Math.random() * qs.length)];
    const shuffled = [...latestPs].sort(() => 0.5 - Math.random());
    const bCount = Math.min(setBluffers, latestPs.length - 1);
    const bIds = shuffled.slice(0, bCount).map((p) => p.id);

    if (room.current_round === 0)
      await supabase
        .from("players")
        .update({ score: 0 })
        .eq("room_id", room.id);

    await Promise.all(
      latestPs.map((p) =>
        supabase
          .from("players")
          .update({
            is_active_bluffer: bIds.includes(p.id),
            role: bIds.includes(p.id) ? "bluffer" : "truth",
            last_vote_id: null,
          })
          .eq("id", p.id),
      ),
    );

    await supabase.from("submissions").delete().eq("room_id", room.id);
    await supabase
      .from("submissions")
      .insert([
        { room_id: room.id, content: q.answer.toUpperCase(), is_truth: true },
      ]);

    await supabase
      .from("rooms")
      .update({
        status: "playing",
        current_question_id: q.id,
        phase_ends_at: new Date(Date.now() + 61000).toISOString(),
        current_round: (room?.current_round || 0) + 1,
        auto_advance: isAuto,
        voting_duration: setVoteTime,
        reveal_duration: setRevealTime,
      })
      .eq("id", room.id);
  };

  const submitBluff = async () => {
    if (!bluff.trim()) return;
    const { data: truthCheck } = await supabase
      .from("submissions")
      .select("content")
      .eq("room_id", room.id)
      .eq("is_truth", true)
      .single();
    if (bluff.toUpperCase() === truthCheck.content)
      return alert("You can't use the real answer!");

    await supabase.from("submissions").insert([
      {
        room_id: room.id,
        player_id: player.id,
        content: bluff.toUpperCase(),
        is_truth: false,
      },
    ]);
    setHasSubmitted(true);

    const { data: s } = await supabase
      .from("submissions")
      .select("id")
      .eq("room_id", room.id);
    if (s.length >= (room.bluffer_count || 1) + 1) {
      forceMoveToVoting();
    }
  };

  const forceMoveToVoting = async () => {
    await supabase
      .from("rooms")
      .update({
        status: "voting",
        phase_ends_at: new Date(
          Date.now() + room.voting_duration * 1000 + 1000,
        ).toISOString(),
      })
      .eq("id", room.id);
  };

  const handleVote = async (id) => {
    if (selectedVote) return;
    setSelectedVote(id);
    await supabase
      .from("players")
      .update({ last_vote_id: id })
      .eq("id", player.id);
    const { data: v } = await supabase
      .from("players")
      .select("last_vote_id")
      .eq("room_id", room.id);
    if (v.filter((x) => x.last_vote_id).length >= players.length)
      revealResults();
  };

  const revealResults = async () => {
    const { data: ps } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", room.id);
    const { data: ss } = await supabase
      .from("submissions")
      .select("*")
      .eq("room_id", room.id);
    const truth = ss.find((s) => s.is_truth);
    for (let p of ps) {
      if (p.last_vote_id === truth.id)
        await supabase
          .from("players")
          .update({ score: p.score + 100 })
          .eq("id", p.id);
    }
    await supabase
      .from("rooms")
      .update({
        status: "reveal",
        phase_ends_at: new Date(
          Date.now() + room.reveal_duration * 1000 + 1000,
        ).toISOString(),
      })
      .eq("id", room.id);
  };

  // --- 3. Effects ---
  const fetchQuestion = useCallback(async (qId, status) => {
    if (!qId) return;
    const selectStr = status === "reveal" ? "*" : "id, content";
    const { data } = await supabase
      .from("questions")
      .select(selectStr)
      .eq("id", qId)
      .maybeSingle();
    if (data) setQuestion(data);
  }, []);

  const fetchSubmissions = useCallback(async (roomId) => {
    if (!roomId) return;
    const { data } = await supabase
      .from("submissions")
      .select("*")
      .eq("room_id", roomId);
    setSubmissions(data?.sort((a, b) => a.id.localeCompare(b.id)) || []);
  }, []);

  const syncCurrentState = useCallback(async () => {
    if (!room?.id) return;
    const { data: pList } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", room.id)
      .order("score", { ascending: false });
    setPlayers(pList || []);
    const curr = pList?.find(
      (p) => p.id === localStorage.getItem("psych_player_id"),
    );
    if (curr) setPlayer(curr);
    if (room.status === "playing")
      fetchQuestion(room.current_question_id, room.status);
    if (room.status === "voting" || room.status === "reveal")
      fetchSubmissions(room.id);
  }, [room, fetchQuestion, fetchSubmissions]);

  useEffect(() => {
    const savedId = localStorage.getItem("psych_player_id");
    if (savedId && !player) {
      supabase
        .from("players")
        .select("*, rooms(*)")
        .eq("id", savedId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.rooms) {
            setPlayer(data);
            setRoom(data.rooms);
            setName(data.name);
          }
        });
    }
  }, [player]);

  useEffect(() => {
    if (!room?.id) return;
    syncCurrentState();
    const channel = supabase
      .channel(`game_${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        (p) => {
          setRoom(p.new);
          if (p.new.status === "playing" || p.new.status === "lobby") {
            setHasSubmitted(false);
            setBluff("");
            setSelectedVote(null);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${room.id}`,
        },
        () => syncCurrentState(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
          filter: `room_id=eq.${room.id}`,
        },
        () => syncCurrentState(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, room?.status, syncCurrentState]);

  useEffect(() => {
    if (!room?.phase_ends_at || room.status === "lobby") return;
    const interval = setInterval(() => {
      const diff = Math.max(
        0,
        Math.floor((new Date(room.phase_ends_at) - new Date()) / 1000),
      );
      setTimeLeft(diff);
      if (diff === 0 && player?.is_host) {
        // DISCONNECT PROTECTION: Timer hits zero? Force the game forward!
        if (room.status === "playing") forceMoveToVoting();
        if (room.status === "voting") revealResults();
        if (room.status === "reveal" && room.auto_advance) {
          room.current_round >= room.max_rounds ? resetSession() : startGame();
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [room?.phase_ends_at, room?.status, player?.is_host, room?.auto_advance]);

  // --- 4. Sub-Components ---
  const TimerUI = () => (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md border border-white/20 px-6 py-2 rounded-full flex items-center gap-3">
      <Clock
        size={16}
        className={
          timeLeft < 10 ? "text-rose-500 animate-pulse" : "text-indigo-400"
        }
      />
      <span className="font-mono font-bold text-xl">{timeLeft}s</span>
    </div>
  );

  const AbortButton = () =>
    player?.is_host && (
      <button
        onClick={resetSession}
        className="fixed bottom-6 right-6 opacity-20 hover:opacity-100 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-500 transition-all"
      >
        <XCircle size={14} /> Abort Session
      </button>
    );

  // --- 5. Views ---
  if (room?.status === "reveal") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050810] p-6 text-white text-center">
        {room.auto_advance && <TimerUI />}
        <AbortButton />
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          className="bg-white/5 backdrop-blur-3xl p-10 rounded-[3rem] border border-white/10 w-full max-w-md"
        >
          <Trophy className="mx-auto mb-2 text-yellow-500" size={40} />
          <h2 className="text-xl font-black mb-6 uppercase">
            Round {room.current_round}
          </h2>
          <div className="space-y-2 mb-8 text-left">
            {players.map((p, i) => (
              <div
                key={p.id}
                className="flex justify-between bg-black/20 p-4 rounded-xl border border-white/5"
              >
                <span className="font-bold">
                  {i + 1}. {p.name}
                </span>
                <span className="text-indigo-400 font-black">{p.score}</span>
              </div>
            ))}
          </div>
          <div className="bg-emerald-500/10 p-6 rounded-2xl border border-emerald-500/20 mb-8">
            <p className="text-emerald-500 text-[10px] font-black uppercase mb-1">
              Correct Answer
            </p>
            <p className="text-xl font-bold">{question?.answer}</p>
          </div>
          {player?.is_host && !room.auto_advance && (
            <button
              onClick={
                room.current_round >= room.max_rounds ? resetSession : startGame
              }
              className="w-full py-5 bg-indigo-600 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"
            >
              {room.current_round >= room.max_rounds
                ? "End Session"
                : "Next Round"}{" "}
              <ChevronRight size={16} />
            </button>
          )}
          {!room.auto_advance && !player?.is_host && (
            <p className="text-[10px] font-black uppercase opacity-30 animate-pulse tracking-widest">
              Waiting for host...
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  if (room?.status === "voting") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050810] p-6 text-white text-center">
        <TimerUI />
        <AbortButton />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full max-w-md space-y-4"
        >
          <h2 className="text-2xl font-bold mb-8 italic leading-snug tracking-tight">
            "{question?.content}"
          </h2>
          <div className="space-y-4">
            {submissions.map((s) => (
              <button
                key={s.id}
                onClick={() => handleVote(s.id)}
                disabled={!!selectedVote}
                className={`w-full p-6 border rounded-2xl text-left font-bold transition-all ${selectedVote === s.id ? "bg-indigo-600 border-indigo-400 scale-[0.98]" : "bg-white/5 border-white/10 hover:bg-white/10"}`}
              >
                {s.content}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  if (room?.status === "playing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050810] p-6 text-white text-center">
        <TimerUI />
        <AbortButton />
        <div className="bg-white/5 p-12 rounded-[3rem] border border-white/10 w-full max-w-md shadow-2xl">
          <h2 className="text-2xl font-bold mb-8 leading-tight">
            {question?.content}
          </h2>
          {player?.is_active_bluffer ? (
            !hasSubmitted ? (
              <div className="space-y-4">
                <input
                  className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-center text-white outline-none focus:border-indigo-500"
                  placeholder="TYPE YOUR LIE..."
                  value={bluff}
                  onChange={(e) => setBluff(e.target.value)}
                />
                <button
                  onClick={submitBluff}
                  className="w-full py-5 bg-indigo-600 rounded-2xl font-black uppercase tracking-widest"
                >
                  Submit Bluff
                </button>
              </div>
            ) : (
              <p className="animate-pulse text-indigo-400 font-bold uppercase tracking-widest text-sm">
                Bluff Recorded
              </p>
            )
          ) : (
            <div className="space-y-6 py-4">
              <p className="text-white/40 italic">Bluffers are typing...</p>
              <div className="bg-black/20 p-4 rounded-2xl border border-white/5 inline-block">
                <span className="text-[10px] font-black uppercase opacity-30 block mb-1">
                  In Progress
                </span>
                <span className="text-xl font-bold tracking-widest">
                  {submissions.length - 1} / {room.bluffer_count}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050810] text-white p-6">
        <h1 className="text-9xl font-black mb-10 tracking-tighter opacity-10 select-none">
          {room.code}
        </h1>
        <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10 w-full max-w-sm space-y-6 shadow-2xl">
          {player?.is_host && (
            <div className="space-y-3 bg-black/40 p-5 rounded-2xl border border-white/5 text-[10px] font-black uppercase tracking-widest">
              <div className="flex justify-between items-center opacity-50">
                <span>Rounds</span>
                <input
                  type="number"
                  className="bg-white/10 w-12 text-center rounded p-1 outline-none"
                  value={setRounds}
                  onChange={(e) => setSetRounds(e.target.value)}
                />
              </div>
              <div className="flex justify-between items-center opacity-50">
                <span>Bluffers</span>
                <input
                  type="number"
                  max={5}
                  className="bg-white/10 w-12 text-center rounded p-1 outline-none"
                  value={setBluffers}
                  onChange={(e) => setSetBluffers(e.target.value)}
                />
              </div>

              <div
                className="flex justify-between items-center cursor-pointer pt-1 border-t border-white/5 mt-2"
                onClick={() => setIsAuto(!isAuto)}
              >
                <span className="opacity-50">Auto-Advance</span>
                {isAuto ? (
                  <ToggleRight className="text-indigo-500" size={20} />
                ) : (
                  <ToggleLeft className="opacity-20" size={20} />
                )}
              </div>

              <div className="flex justify-between items-center opacity-50">
                <span>Vote Time (s)</span>
                <input
                  type="number"
                  className="bg-white/10 w-12 text-center rounded p-1 outline-none"
                  value={setVoteTime}
                  onChange={(e) => setSetVoteTime(e.target.value)}
                />
              </div>
              <div className="flex justify-between items-center opacity-50">
                <span>Reveal Time (s)</span>
                <input
                  type="number"
                  className="bg-white/10 w-12 text-center rounded p-1 outline-none"
                  value={setRevealTime}
                  onChange={(e) => setSetRevealTime(e.target.value)}
                />
              </div>

              <div className="mt-4 pt-4 border-t border-white/10">
                <span className="block mb-2 opacity-50">Load JSON Deck</span>
                <div className="flex gap-2">
                  <label className="flex-1 bg-indigo-600 hover:bg-indigo-700 py-2 rounded text-center cursor-pointer transition-colors">
                    <UploadCloud size={12} className="inline mr-2" />
                    Upload
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleJsonUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={clearCustomDeck}
                    className="bg-rose-500/20 hover:bg-rose-500/40 text-rose-500 px-3 rounded transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
            {players.map((p) => (
              <div
                key={p.id}
                className="text-[10px] font-bold uppercase bg-white/5 p-2 rounded-lg text-center truncate"
              >
                {p.name}
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-2">
            {player?.is_host && (
              <button
                onClick={startGame}
                className="w-full py-5 bg-indigo-600 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                Start Session <ChevronRight size={16} />
              </button>
            )}
            <button
              onClick={leaveRoom}
              className="w-full py-3 bg-white/5 rounded-xl font-black uppercase text-[10px] opacity-40 hover:opacity-100 flex items-center justify-center gap-2 tracking-widest transition-all"
            >
              <LogOut size={12} /> Leave Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#050810] text-white p-6">
      <div className="bg-white/5 p-12 rounded-[3.5rem] border border-white/10 w-full max-w-md text-center shadow-2xl">
        <h1 className="text-6xl font-black italic mb-16 tracking-tighter leading-none select-none">
          Psych<span className="text-indigo-500">-</span>Sync
        </h1>
        <input
          className="w-full bg-transparent border-b-4 border-white/10 p-4 text-center text-3xl font-black uppercase mb-12 text-white outline-none focus:border-indigo-500 transition-all"
          placeholder="YOUR NAME"
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
        />
        <div className="grid grid-cols-2 gap-6">
          <button
            onClick={createRoom}
            className="py-6 bg-indigo-600 hover:bg-indigo-700 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all"
          >
            Create Room
          </button>
          <div className="flex flex-col gap-2">
            <input
              className="bg-black/40 border border-white/10 p-4 rounded-xl text-center font-mono text-xl text-white outline-none focus:border-white/30 transition-all uppercase"
              placeholder="0000"
              maxLength={4}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
            />
            <button
              onClick={joinRoom}
              className="text-[10px] font-black opacity-20 hover:opacity-100 uppercase tracking-widest transition-all"
            >
              Join Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
