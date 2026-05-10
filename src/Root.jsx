import { useState, useEffect } from "react";
import Landing from "./Landing";
import App from "./App";
import { ThemeToggle } from "./components/ThemeToggle";

export default function Root() {
  const [game, setGame] = useState(null);

  useEffect(() => {
    document.body.style.overflow = game ? "hidden" : "auto";
  }, [game]);

  return (
    <>
      <ThemeToggle />
      {game === "bluff" ? (
        <App onBack={() => setGame(null)} />
      ) : (
        <Landing onSelect={setGame} />
      )}
    </>
  );
}
