import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./darkmode.css";
import Root from "./Root.jsx";
import { ThemeProvider } from "./lib/ThemeContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  </StrictMode>,
);
