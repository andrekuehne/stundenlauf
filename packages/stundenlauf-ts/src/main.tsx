import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./theme.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('Missing required element "#root"');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
