import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import heroImg from "./assets/hero.png";

const GAMES = [
  {
    id: "bluff",
    title: "Bluff!",
    accentChar: "",
    accent: "#7c3aed",
    accentRgb: "124,58,237",
    tagline: "Bluff · Guess · Outsmart",
    description:
      "Write fake answers to real trivia and fool your friends. The best bluffer wins.",
    tags: ["2–10 players", "Party", "Trivia"],
    image: heroImg,
    live: true,
  },
  {
    id: "coming1",
    title: "???",
    accentChar: "",
    accent: "#0e7490",
    accentRgb: "14,116,144",
    tagline: "Coming Soon",
    description:
      "Another multiplayer party game is in development. Stay tuned.",
    tags: ["Multiplayer"],
    image: null,
    live: false,
  },
];

export default function Landing({ onSelect }) {
  return (
    <div
      className="w-full flex flex-col items-center py-16 px-6 relative bg-white dark:bg-slate-950 transition-colors"
      style={{ fontFamily: "'Syne', sans-serif", minHeight: "100dvh" }}
    >
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-150 h-100 bg-violet-600/10 dark:bg-violet-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-100 h-100 bg-cyan-500/5 dark:bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center mb-14"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400 dark:text-violet-400 mb-3">
          Game Night
        </p>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">
          Pick a Game
        </h1>
        <p className="text-xs sm:text-sm font-bold text-slate-600 dark:text-white/30 mt-3">
          Multiplayer party games for groups
        </p>
      </motion.div>

      <div className="relative z-10 flex flex-wrap justify-center gap-3 sm:gap-5 w-full max-w-3xl px-2">
        {GAMES.map((game, i) => (
          <GameTile key={game.id} game={game} index={i} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function GameTile({ game, index, onSelect }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.12,
        type: "spring",
        stiffness: 180,
        damping: 22,
      }}
      className="w-full sm:w-80 md:w-72 p-5 sm:p-7 flex flex-col dark:bg-opacity-100"
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "1.5rem",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.5), 0 32px 64px rgba(0,0,0,0.4)",
        opacity: game.live ? 1 : 0.45,
        filter: game.live ? "none" : "grayscale(1)",
      }}
    >
      {game.image ? (
        <div className="h-28 flex items-center justify-center mb-5">
          <img
            src={game.image}
            alt={game.title}
            className="h-full object-contain drop-shadow-2xl"
          />
        </div>
      ) : (
        <div
          className="h-28 rounded-2xl mb-5 flex items-center justify-center text-4xl font-black"
          style={{
            background: `rgba(${game.accentRgb},0.1)`,
            color: game.accent,
          }}
        >
          ?
        </div>
      )}

      <div className="flex items-start justify-between gap-2 mb-1">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white leading-none">
          {game.title}
          {game.accentChar && (
            <span style={{ color: game.accent }}>{game.accentChar}</span>
          )}
        </h2>
        <span
          className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shrink-0"
          style={
            game.live
              ? {
                  background: `rgba(${game.accentRgb},0.15)`,
                  color: game.accent,
                }
              : {
                  background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.3)",
                }
          }
        >
          {game.live ? "Live" : "Soon"}
        </span>
      </div>

      <p
        className="text-[10px] font-black uppercase tracking-widest mb-3"
        style={{ color: game.accent, opacity: 0.8 }}
      >
        {game.tagline}
      </p>

      <p className="text-sm text-slate-600 dark:text-white/40 font-bold mb-5 leading-relaxed flex-1">
        {game.description}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-5">
        {game.tags.map((tag) => (
          <span
            key={tag}
            className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-white/5 text-slate-600 dark:text-white/30"
          >
            {tag}
          </span>
        ))}
      </div>

      {game.live ? (
        <button
          onClick={() => onSelect(game.id)}
          className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest
                     text-white flex items-center justify-center gap-2
                     transition-all hover:-translate-y-0.5 active:translate-y-0"
          style={{
            background: `linear-gradient(135deg, ${game.accent}, #5b21b6)`,
            boxShadow: `0 4px 24px rgba(${game.accentRgb},0.35)`,
          }}
        >
          Play Now <ChevronRight size={14} />
        </button>
      ) : (
        <div
          className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest
                      text-slate-400 dark:text-white/20 border border-slate-300 dark:border-white/5 text-center bg-slate-100 dark:bg-white/3"
        >
          Coming Soon
        </div>
      )}
    </motion.div>
  );
}
