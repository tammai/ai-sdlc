import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom does not implement scrolling; the router calls it on navigation.
if (typeof window !== "undefined") window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
