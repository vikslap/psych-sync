import { useState, useEffect } from "react";
import Landing from "./Landing";
import App from "./App";

export default function Root() {
  const [game, setGame] = useState(null);

  useEffect(() => {
    document.body.style.overflow = game ? "hidden" : "auto";
  }, [game]);

  return (
    <>
      {game === "bluff" ? (
        <App onBack={() => setGame(null)} />
      ) : (
        <Landing onSelect={setGame} />
      )}
    </>
  );
}
