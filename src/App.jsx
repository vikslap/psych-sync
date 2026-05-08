import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";
import {
  PlayCircle,
  Trophy,
  Clock,
  ChevronRight,
  XCircle,
  LogOut,
  UploadCloud,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Check,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── SCORING CONSTANTS ────────────────────────────────────────────────────────
const POINTS_CORRECT_GUESS = 1000;
const POINTS_PER_FOOL = 500;

const nowPlusMs = (ms) => new Date(Date.now() + ms).toISOString();
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─── BLUFFER SELECTION RULE ───────────────────────────────────────────────────
// ≤ 5 players → everyone bluffs | > 5 players → exactly 5 random bluffers
function pickBluffers(allIds) {
  const arr = [...allIds];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const count = allIds.length <= 5 ? allIds.length - 1 : 5;
  return arr.slice(0, Math.max(0, count));
}

export default function App() {
  // ── State ──────────────────────────────────────────────────────────────────
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

  // Host settings (local only, written to DB on startGame)
  const [rounds, setRounds] = useState(5);
  const [voteTime, setVoteTime] = useState(30);
  const [revealTime, setRevealTime] = useState(15);
  const [isAuto, setIsAuto] = useState(true);

  // ── Stable refs — avoid stale closures without useCallback ───────────────
  const roomRef = useRef(null); // always-current room snapshot
  const playerRef = useRef(null); // always-current player snapshot
  const playersRef = useRef([]); // always-current players list
  const advancingRef = useRef(false); // guard against double phase-advances
  const settingsRef = useRef({ rounds, voteTime, revealTime, isAuto });

  useEffect(() => {
    roomRef.current = room;
  }, [room]);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  useEffect(() => {
    settingsRef.current = { rounds, voteTime, revealTime, isAuto };
  }, [rounds, voteTime, revealTime, isAuto]);

  // ── Data fetcher — always called async, never directly in effect body ─────
  const syncState = async (roomSnap) => {
    const r = roomSnap ?? roomRef.current;
    if (!r?.id) return;

    const { data: pList } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", r.id)
      .order("score", { ascending: false })
      .order("id", { ascending: true });
    setPlayers(pList ?? []);

    const me = pList?.find(
      (p) => p.id === localStorage.getItem("psych_player_id"),
    );
    if (me) setPlayer(me);

    if (r.status === "playing" && r.current_question_id) {
      const { data: q } = await supabase
        .from("questions")
        .select("id, content")
        .eq("id", r.current_question_id)
        .maybeSingle();
      if (q) setQuestion(q);
    }

    // Fetch only id+player_id during playing — count bluffs and derive hasSubmitted without leaking answer
    if (r.status === "playing") {
      const myId = localStorage.getItem("psych_player_id");
      const { data: subs } = await supabase
        .from("submissions")
        .select("id, player_id")
        .eq("room_id", r.id);
      setSubmissions(subs ?? []);
      if (myId && subs?.some((s) => s.player_id === myId)) setHasSubmitted(true);
    }

    if (r.status === "voting" || r.status === "reveal") {
      const isBluffer = playerRef.current?.is_active_bluffer;
      const { data: subs } = await supabase
        .from("submissions")
        .select(isBluffer && r.status === "voting" ? "id" : "*")
        .eq("room_id", r.id);
      setSubmissions(subs?.sort((a, b) => a.id.localeCompare(b.id)) ?? []);
    }

    // Full question (with answer) only during reveal
    if (r.status === "reveal" && r.current_question_id) {
      const { data: q } = await supabase
        .from("questions")
        .select("*")
        .eq("id", r.current_question_id)
        .maybeSingle();
      if (q) setQuestion(q);
    }
  };

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    const savedId = localStorage.getItem("psych_player_id");
    if (!savedId) return;
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
  }, []); // intentionally empty — runs once on mount

  // ── Realtime subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    if (!room?.id) return;

    // FIX: use setTimeout so setState is never called synchronously inside effect
    const initTimer = setTimeout(() => syncState(room), 0);

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
        ({ new: newRoom }) => {
          setRoom(newRoom);
          advancingRef.current = false;
          if (["playing", "lobby"].includes(newRoom.status)) {
            setHasSubmitted(false);
            setBluff("");
            setSelectedVote(null);
          }
          if (newRoom.status === "lobby") setQuestion(null);
          syncState(newRoom);
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
        () => syncState(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
          filter: `room_id=eq.${room.id}`,
        },
        () => syncState(),
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") console.error("Realtime error:", err);
      });

    return () => {
      clearTimeout(initTimer);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]); // only re-subscribe when room ID changes — intentional

  // ─── ACTIONS (plain async fns reading from refs — no useCallback needed) ──

  const leaveRoom = async () => {
    if (!window.confirm("Leave this room?")) return;
    const p = playerRef.current;
    const r = roomRef.current;
    if (p?.is_host) {
      const others = playersRef.current.filter((pl) => pl.id !== p.id);
      if (others.length > 0) {
        await supabase.from("players").update({ is_host: true }).eq("id", others[0].id);
      } else {
        await supabase.from("rooms").delete().eq("id", r.id);
      }
    }
    if (p?.id) await supabase.from("players").delete().eq("id", p.id);
    localStorage.removeItem("psych_player_id");
    window.location.reload();
  };

  const resetSession = async () => {
    const r = roomRef.current;
    if (!r?.id) return;
    advancingRef.current = false;
    await supabase
      .from("rooms")
      .update({
        status: "lobby",
        current_round: 0,
        phase_ends_at: null,
        current_question_id: null,
      })
      .eq("id", r.id);
    await supabase
      .from("players")
      .update({
        score: 0,
        last_vote_id: null,
        is_active_bluffer: false,
      })
      .eq("room_id", r.id);
    await supabase.from("submissions").delete().eq("room_id", r.id);
  };

  const createRoom = async () => {
    if (!name.trim()) return;
    const {
      rounds: r,
      voteTime: vt,
      revealTime: rt,
      isAuto: a,
    } = settingsRef.current;
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const { data: nr, error: re } = await supabase
      .from("rooms")
      .insert([
        {
          code,
          status: "lobby",
          current_round: 0,
          max_rounds: r,
          voting_duration: vt,
          reveal_duration: rt,
          auto_advance: a,
        },
      ])
      .select()
      .single();
    if (re || !nr) return alert("Failed to create room. Try again.");
    const { data: np, error: pe } = await supabase
      .from("players")
      .insert([
        {
          name: name.toUpperCase(),
          room_id: nr.id,
          is_host: true,
          score: 0,
        },
      ])
      .select()
      .single();
    if (pe || !np) return alert("Failed to join room. Try again.");
    localStorage.setItem("psych_player_id", np.id);
    setRoom(nr);
    setPlayer(np);
  };

  const joinRoom = async () => {
    if (!name.trim() || !roomCode.trim()) return;
    const { data: tr, error: re } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", roomCode)
      .single();
    if (re || !tr) return alert("Room not found!");
    if (tr.status !== "lobby") return alert("Game already in progress!");
    const { data: np, error: pe } = await supabase
      .from("players")
      .insert([
        {
          name: name.toUpperCase(),
          room_id: tr.id,
          score: 0,
        },
      ])
      .select()
      .single();
    if (pe || !np) return alert("Failed to join. Try again.");
    localStorage.setItem("psych_player_id", np.id);
    setRoom(tr);
    setPlayer(np);
  };

  const startGame = async () => {
    const r = roomRef.current;
    if (!r?.id) return;
    advancingRef.current = false;
    const {
      rounds: maxR,
      voteTime: vt,
      revealTime: rt,
      isAuto: a,
    } = settingsRef.current;

    const { data: latestPs } = await supabase
      .from("players")
      .select("id")
      .eq("room_id", r.id);
    if (!latestPs?.length) return;

    // Question selection: custom deck first, fall back to defaults
    let { data: qs } = await supabase
      .from("questions")
      .select("*")
      .eq("room_id", r.id);
    if (!qs?.length) {
      const { data: defQs } = await supabase
        .from("questions")
        .select("*")
        .is("room_id", null);
      qs = defQs;
    }
    if (!qs?.length) return alert("No questions found!");
    const q = pickRandom(qs);

    // Auto bluffer selection rule
    const bIds = pickBluffers(latestPs.map((p) => p.id));

    if ((r.current_round ?? 0) === 0) {
      await supabase.from("players").update({ score: 0 }).eq("room_id", r.id);
    }

    await Promise.all(
      latestPs.map((p) =>
        supabase
          .from("players")
          .update({
            is_active_bluffer: bIds.includes(p.id),
            last_vote_id: null,
          })
          .eq("id", p.id),
      ),
    );

    await supabase.from("submissions").delete().eq("room_id", r.id);
    await supabase.from("submissions").insert([
      {
        room_id: r.id,
        content: q.answer.toUpperCase(),
        is_truth: true,
      },
    ]);

    await supabase
      .from("rooms")
      .update({
        status: "playing",
        current_question_id: q.id,
        phase_ends_at: nowPlusMs(61_000),
        current_round: (r.current_round ?? 0) + 1,
        bluffer_count: bIds.length,
        max_rounds: maxR,
        voting_duration: vt,
        reveal_duration: rt,
        auto_advance: a,
      })
      .eq("id", r.id);
  };

  const forceMoveToVoting = async () => {
    const r = roomRef.current;
    if (!r?.id || advancingRef.current) return;
    if (r.status !== "playing") return;
    advancingRef.current = true;
    await supabase
      .from("rooms")
      .update({
        status: "voting",
        phase_ends_at: nowPlusMs((r.voting_duration ?? 30) * 1000 + 1000),
      })
      .eq("id", r.id);
  };

  const submitBluff = async () => {
    const r = roomRef.current;
    const p = playerRef.current;
    if (!bluff.trim() || !r || !p) return;
    const { data: truth } = await supabase
      .from("submissions")
      .select("content")
      .eq("room_id", r.id)
      .eq("is_truth", true)
      .single();
    if (bluff.toUpperCase() === truth?.content)
      return alert("That's the real answer!");
    await supabase.from("submissions").insert([
      {
        room_id: r.id,
        player_id: p.id,
        content: bluff.toUpperCase(),
        is_truth: false,
      },
    ]);
    setHasSubmitted(true);
  };

  const handleVote = async (id) => {
    const r = roomRef.current;
    const p = playerRef.current;
    const ps = playersRef.current;
    if (selectedVote || !r || !p) return;
    setSelectedVote(id);
    await supabase.from("players").update({ last_vote_id: id }).eq("id", p.id).is("last_vote_id", null);
    if (p.is_host) {
      const { data: v } = await supabase
        .from("players")
        .select("last_vote_id")
        .eq("room_id", r.id);
      const voterCount = ps.filter((p) => !p.is_active_bluffer).length;
      if (v?.filter((x) => x.last_vote_id).length >= voterCount) revealResults();
    }
  };

  const revealResults = async () => {
    const r = roomRef.current;
    if (!r?.id || advancingRef.current) return;
    if (r.status !== "voting") return;
    advancingRef.current = true;
    const { data: ps } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", r.id);
    const { data: ss } = await supabase
      .from("submissions")
      .select("*")
      .eq("room_id", r.id);
    const truth = ss?.find((s) => s.is_truth);
    if (!truth || !ps) return;

    const scoreMap = Object.fromEntries(ps.map((p) => [p.id, p.score ?? 0]));

    // +1000 for correct guess
    ps.forEach((p) => {
      if (p.last_vote_id === truth.id) scoreMap[p.id] += POINTS_CORRECT_GUESS;
    });

    // +500 per player fooled (bluffer reward)
    ss.filter((s) => !s.is_truth && s.player_id).forEach((fake) => {
      const fooled = ps.filter((p) => p.last_vote_id === fake.id).length;
      if (fooled > 0) {
        scoreMap[fake.player_id] =
          (scoreMap[fake.player_id] ?? 0) + fooled * POINTS_PER_FOOL;
      }
    });

    await Promise.all(
      Object.entries(scoreMap).map(([pid, score]) =>
        supabase.from("players").update({ score }).eq("id", pid),
      ),
    );

    await supabase
      .from("rooms")
      .update({
        status: "reveal",
        phase_ends_at: nowPlusMs((r.reveal_duration ?? 15) * 1000 + 1000),
      })
      .eq("id", r.id);
  };

  const handleJsonUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        if (!Array.isArray(json)) throw new Error();
        const valid = json.filter((q) => q?.content && q?.answer);
        if (!valid.length)
          return alert("No valid questions found. Expected [{content, answer}]");
        const formatted = valid.map((q) => ({
          content: q.content,
          answer: String(q.answer).toUpperCase(),
          room_id: roomRef.current?.id,
        }));
        await supabase.from("questions").insert(formatted);
        alert(`Loaded ${formatted.length} of ${json.length} questions!`);
      } catch {
        alert("Invalid JSON. Expected [{content, answer}]");
      }
    };
    reader.readAsText(file);
  };

  const clearCustomDeck = async () => {
    if (!window.confirm("Delete all custom questions for this room?")) return;
    await supabase
      .from("questions")
      .delete()
      .eq("room_id", roomRef.current?.id);
    alert("Custom deck cleared.");
  };

  // ── Countdown + host auto-advance (reads from refs — no stale closures) ──
  useEffect(() => {
    if (!room?.phase_ends_at || room.status === "lobby") return;
    const interval = setInterval(() => {
      const diff = Math.max(
        0,
        Math.floor((new Date(room.phase_ends_at) - new Date()) / 1000),
      );
      setTimeLeft(diff);
      if (diff === 0 && playerRef.current?.is_host && !advancingRef.current) {
        const r = roomRef.current;
        if (r.status === "playing") forceMoveToVoting();
        if (r.status === "voting") revealResults();
        if (r.status === "reveal" && r.auto_advance) {
          r.current_round >= r.max_rounds ? resetSession() : startGame();
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [room?.phase_ends_at, room?.status]); // refs used inside — no extra deps

  // ── Early advance to voting once all bluffs are in ────────────────────────
  useEffect(() => {
    const r = roomRef.current;
    if (r?.status !== "playing" || !playerRef.current?.is_host) return;
    if (!r.bluffer_count) return;
    if (submissions.length >= r.bluffer_count + 1) forceMoveToVoting();
  }, [submissions]);

  // ── Early reveal once all non-bluffers have voted ─────────────────────────
  useEffect(() => {
    const r = roomRef.current;
    if (r?.status !== "voting" || !playerRef.current?.is_host) return;
    const voters = players.filter((p) => !p.is_active_bluffer);
    if (voters.length > 0 && voters.every((p) => p.last_vote_id)) revealResults();
  }, [players]);

  // ─── VIEWS ───────────────────────────────────────────────────────────────

  // REVEAL
  if (room?.status === "reveal") {
    return (
      <Screen>
        {room.auto_advance && <TimerUI timeLeft={timeLeft} />}
        <AbortBtn isHost={player?.is_host} onAbort={resetSession} />
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="glass-card w-full max-w-md"
        >
          <div className="flex items-center gap-2 mb-6">
            <Trophy size={22} className="text-amber-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white/60">
              Round {room.current_round} · Scores
            </h2>
          </div>

          <div className="space-y-2 mb-7">
            <AnimatePresence>
              {players.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.06 }}
                  className={`flex justify-between items-center px-4 py-3 rounded-xl border
                    ${
                      p.id === player?.id
                        ? "bg-violet-500/10 border-violet-500/30"
                        : "bg-white/3 border-white/5"
                    }`}
                >
                  <span className="text-xs font-bold uppercase tracking-wide text-white/80">
                    {["🥇", "🥈", "🥉"][i] ?? `#${i + 1}`} {p.name}
                  </span>
                  <span className="font-black text-violet-400 tabular-nums">
                    {p.score.toLocaleString()}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 mb-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">
              ✓ Correct Answer
            </p>
            <p className="text-xl font-bold text-white">{question?.answer}</p>
          </div>

          {submissions.filter((s) => !s.is_truth).length > 0 && (
            <div className="space-y-2 mb-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">
                Bluffs
              </p>
              {submissions
                .filter((s) => !s.is_truth)
                .map((s) => {
                  const author = players.find((p) => p.id === s.player_id);
                  const fooled = players.filter(
                    (p) => p.last_vote_id === s.id,
                  ).length;
                  return (
                    <div
                      key={s.id}
                      className="flex justify-between items-center px-4 py-3
                               bg-rose-500/5 border border-rose-500/10 rounded-xl"
                    >
                      <div>
                        <p className="text-sm font-bold text-white/80">
                          {s.content}
                        </p>
                        <p className="text-[10px] text-white/30 mt-0.5">
                          by {author?.name ?? "?"}
                        </p>
                      </div>
                      {fooled > 0 && (
                        <span
                          className="text-[10px] font-black text-rose-400 bg-rose-500/10
                                       border border-rose-500/20 px-2 py-1 rounded-lg ml-3 shrink-0"
                        >
                          fooled {fooled} · +{fooled * POINTS_PER_FOOL}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {player?.is_host && !room.auto_advance && (
            <button
              onClick={
                room.current_round >= room.max_rounds ? resetSession : startGame
              }
              className="btn-primary w-full"
            >
              {room.current_round >= room.max_rounds
                ? "End Game"
                : "Next Round"}
              <ChevronRight size={15} />
            </button>
          )}
          {!player?.is_host && !room.auto_advance && (
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-white/20 animate-pulse">
              Waiting for host…
            </p>
          )}
        </motion.div>
      </Screen>
    );
  }

  // VOTING
  if (room?.status === "voting") {
    return (
      <Screen>
        <TimerUI timeLeft={timeLeft} />
        <AbortBtn isHost={player?.is_host} onAbort={resetSession} />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-5"
        >
          <div className="text-center mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">
              The Question
            </p>
            <h2 className="text-2xl font-black italic leading-snug text-white">
              "{question?.content}"
            </h2>
          </div>

          {player?.is_active_bluffer ? (
            <div className="glass-card text-center py-8">
              <Zap size={32} className="mx-auto text-violet-400 mb-3" />
              <p className="font-black uppercase tracking-widest text-sm text-white/60">
                You're a bluffer — sit tight!
              </p>
              <p className="text-xs text-white/30 mt-1">
                Did your answer fool them? 😈
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 text-center">
                Spot the truth
              </p>
              {submissions.map((s, idx) => (
                <motion.button
                  key={s.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleVote(s.id)}
                  disabled={!!selectedVote}
                  className={`w-full p-5 border rounded-2xl text-left font-bold transition-all duration-200 relative
                    ${
                      selectedVote === s.id
                        ? "bg-violet-600/20 border-violet-500 text-white"
                        : "bg-white/3 border-white/10 hover:bg-white/[0.07] text-white/80"
                    }
                    ${selectedVote && selectedVote !== s.id ? "opacity-40" : ""}`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/30 mr-3">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {s.content}
                  {selectedVote === s.id && (
                    <Check
                      size={15}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-violet-400"
                    />
                  )}
                </motion.button>
              ))}
            </div>
          )}

          {selectedVote && (
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-white/25 animate-pulse">
              Vote locked · Waiting for others…
            </p>
          )}
        </motion.div>
      </Screen>
    );
  }

  // PLAYING
  if (room?.status === "playing") {
    const bluffsIn = Math.max(0, submissions.length - 1);
    const bluffsNeeded = room.bluffer_count ?? 0;

    return (
      <Screen>
        <TimerUI timeLeft={timeLeft} />
        <AbortBtn isHost={player?.is_host} onAbort={resetSession} />
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card w-full max-w-md"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4">
            Round {room.current_round} of {room.max_rounds}
          </p>
          <h2 className="text-2xl font-black leading-tight text-white mb-8">
            {question?.content}
          </h2>

          {player?.is_active_bluffer ? (
            !hasSubmitted ? (
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">
                  🎭 You're a bluffer — write a convincing lie
                </p>
                <input
                  className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-center
                             text-white font-bold text-lg outline-none focus:border-violet-500
                             transition-colors uppercase placeholder:text-white/20"
                  placeholder="YOUR LIE HERE…"
                  value={bluff}
                  onChange={(e) => setBluff(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitBluff()}
                />
                <button
                  onClick={submitBluff}
                  disabled={!bluff.trim()}
                  className="btn-primary w-full disabled:opacity-30"
                >
                  Submit Bluff
                </button>
              </div>
            ) : (
              <div className="text-center py-6">
                <Check size={32} className="mx-auto text-emerald-400 mb-2" />
                <p className="font-black uppercase tracking-widest text-sm text-emerald-400">
                  Bluff Recorded
                </p>
                <p className="text-xs text-white/30 mt-1">
                  Waiting for others…
                </p>
              </div>
            )
          ) : (
            <div className="text-center py-6 space-y-4">
              <p className="text-white/40 text-sm italic">
                Bluffers are typing…
              </p>
              <div className="inline-flex items-center gap-2 bg-black/20 px-5 py-3 rounded-2xl border border-white/5">
                <span className="text-[10px] font-black uppercase text-white/30">
                  Bluffs in:
                </span>
                <span className="font-black text-xl text-white tabular-nums">
                  {bluffsIn} / {bluffsNeeded}
                </span>
              </div>
              <p className="text-[10px] text-white/25 uppercase tracking-widest">
                You'll vote once all bluffs are in
              </p>
            </div>
          )}
        </motion.div>
      </Screen>
    );
  }

  // LOBBY
  if (room) {
    return (
      <Screen>
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none">
          <span className="text-[22vw] font-black text-white/2.5 tracking-tighter">
            {room.code}
          </span>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card w-full max-w-sm relative z-10"
        >
          <div className="text-center mb-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">
              Room Code
            </p>
            <p className="text-5xl font-black tracking-widest text-white">
              {room.code}
            </p>
          </div>

          {player?.is_host && (
            <div
              className="space-y-2 bg-black/30 p-4 rounded-2xl border border-white/5
                            text-[10px] font-black uppercase tracking-widest mb-5"
            >
              <Row label="Rounds">
                <NumInput
                  value={rounds}
                  onChange={setRounds}
                  min={1}
                  max={20}
                />
              </Row>
              <Row label="Vote Time (s)">
                <NumInput
                  value={voteTime}
                  onChange={setVoteTime}
                  min={10}
                  max={120}
                />
              </Row>
              <Row label="Reveal Time (s)">
                <NumInput
                  value={revealTime}
                  onChange={setRevealTime}
                  min={5}
                  max={60}
                />
              </Row>
              <div
                className="flex justify-between items-center cursor-pointer pt-2 border-t border-white/5 mt-2"
                onClick={() => setIsAuto((v) => !v)}
              >
                <span className="opacity-50">Auto-Advance</span>
                {isAuto ? (
                  <ToggleRight size={20} className="text-violet-500" />
                ) : (
                  <ToggleLeft size={20} className="opacity-20" />
                )}
              </div>
              <div className="pt-3 border-t border-white/5">
                <span className="block mb-2 opacity-50">
                  Custom Deck (JSON)
                </span>
                <div className="flex gap-2">
                  <label
                    className="flex-1 bg-violet-600 hover:bg-violet-700 py-2 rounded-xl text-center
                                   cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                  >
                    <UploadCloud size={11} /> Upload
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleJsonUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={clearCustomDeck}
                    className="bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 px-3 rounded-xl transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="text-[9px] font-bold uppercase tracking-widest text-white/20 text-center mb-4">
            ≤ 5 players → everyone bluffs · &gt; 5 → 5 random bluffers / round
          </div>

          <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto mb-5">
            {players.map((p) => (
              <div
                key={p.id}
                className={`text-[10px] font-bold uppercase px-3 py-2 rounded-xl text-center truncate
                  ${
                    p.id === player?.id
                      ? "bg-violet-500/20 border border-violet-500/30 text-violet-300"
                      : "bg-white/4 border border-white/5 text-white/60"
                  }`}
              >
                {p.name} {p.is_host && "👑"}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {player?.is_host ? (
              <button onClick={startGame} className="btn-primary w-full">
                <PlayCircle size={16} /> Start Game
              </button>
            ) : (
              <p className="text-center text-[10px] font-black uppercase tracking-widest text-white/20 animate-pulse py-2">
                Waiting for host to start…
              </p>
            )}
            <button
              onClick={leaveRoom}
              className="w-full py-3 bg-white/3 hover:bg-white/[0.07] border border-white/5 rounded-xl
                         font-black uppercase text-[10px] tracking-widest text-white/30 hover:text-white/60
                         flex items-center justify-center gap-2 transition-all"
            >
              <LogOut size={12} /> Leave Room
            </button>
          </div>
        </motion.div>
      </Screen>
    );
  }

  // HOME
  return (
    <Screen>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 22 }}
        className="glass-card w-full max-w-md text-center"
      >
        <h1 className="text-7xl font-black italic tracking-tighter leading-none mb-2 select-none">
          Psych<span className="text-violet-500">!</span>
        </h1>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-10">
          Bluff · Guess · Outsmart
        </p>
        <input
          className="w-full bg-transparent border-b-2 border-white/10 pb-3 mb-8 text-center
                     text-3xl font-black uppercase text-white outline-none focus:border-violet-500
                     transition-colors placeholder:text-white/15"
          placeholder="YOUR NAME"
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          maxLength={16}
        />
        <div className="grid grid-cols-2 gap-4">
          <button onClick={createRoom} className="btn-primary py-5">
            Create Room
          </button>
          <div className="flex flex-col gap-2">
            <input
              className="bg-black/40 border border-white/10 p-3 rounded-xl text-center font-mono
                         text-xl font-bold text-white outline-none focus:border-white/30
                         transition-colors uppercase placeholder:text-white/20"
              placeholder="0000"
              maxLength={4}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
            />
            <button
              onClick={joinRoom}
              className="text-[10px] font-black opacity-30 hover:opacity-100 uppercase tracking-widest transition-all py-1"
            >
              Join Game
            </button>
          </div>
        </div>
      </motion.div>
    </Screen>
  );
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
function TimerUI({ timeLeft }) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-[#0d0d14]/80
                 backdrop-blur-xl border border-white/10 px-5 py-2 rounded-full
                 flex items-center gap-3 shadow-xl"
    >
      <Clock
        size={14}
        className={
          timeLeft < 10 ? "text-rose-400 animate-pulse" : "text-slate-400"
        }
      />
      <span
        className={`font-mono font-black text-lg tabular-nums ${timeLeft < 10 ? "text-rose-400" : "text-white"}`}
      >
        {timeLeft}s
      </span>
    </motion.div>
  );
}

function AbortBtn({ isHost, onAbort }) {
  return isHost ? (
    <button
      onClick={onAbort}
      className="fixed bottom-6 right-6 opacity-20 hover:opacity-100 flex items-center
               gap-1.5 text-[10px] font-black uppercase tracking-widest text-rose-500 transition-all"
    >
      <XCircle size={13} /> Abort
    </button>
  ) : null;
}

// ─── SHARED PRIMITIVES ────────────────────────────────────────────────────────
function Screen({ children }) {
  return (
    <div className="min-h-screen bg-[#07070f] flex flex-col items-center justify-center p-5 relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-150 h-100 bg-violet-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-100 h-100 bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>
      <div className="relative z-10 w-full flex flex-col items-center">
        {children}
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&display=swap');
        * { font-family: 'Syne', sans-serif; }
        .glass-card {
          background: rgba(255,255,255,0.03); backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.07); border-radius: 2rem; padding: 2rem;
          box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 32px 64px rgba(0,0,0,0.4);
        }
        .btn-primary {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          background: linear-gradient(135deg, #7c3aed, #5b21b6); color: white; border: none;
          border-radius: 0.875rem; padding: 0.875rem 1.25rem; font-size: 0.7rem; font-weight: 900;
          letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: all 0.2s;
          box-shadow: 0 4px 24px rgba(124,58,237,0.35);
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(124,58,237,0.45); }
        .btn-primary:active { transform: translateY(0); }
        .btn-primary:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
      `}</style>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between items-center opacity-60">
      <span>{label}</span>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, min = 1, max = 99 }) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      className="bg-white/10 w-14 text-center rounded-lg p-1 outline-none text-white font-black
                 text-sm border border-white/10 focus:border-white/30 transition-colors"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}
