import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { captureTokenFromUrl } from "./lib/api.js";
import "./styles.css";

// Runs before the first render so the initial section fetches already carry the token.
captureTokenFromUrl();

const container = document.getElementById("root");
if (!container) throw new Error("root element not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
