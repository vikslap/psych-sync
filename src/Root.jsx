import { useState, useEffect } from "react";
import Landing from "./Landing";
import App from "./App";

export default function Root() {
  const [game, setGame] = useState(null);

  useEffect(() => {
    document.body.style.overflow = game ? "hidden" : "auto";
  }, [game]);

  if (game === "psych") return <App onBack={() => setGame(null)} />;
  return <Landing onSelect={setGame} />;
}
