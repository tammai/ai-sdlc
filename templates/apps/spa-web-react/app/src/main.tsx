import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { createAppInstance } from "./instance";
import "./index.css";

// Follow the OS light/dark preference (shadcn dark mode is the `.dark` class on <html>).
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

const instance = createAppInstance();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App {...instance} />
  </StrictMode>,
);
