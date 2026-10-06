import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Follow the OS light/dark preference (shadcn dark mode is the `.dark` class on <html>).
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
