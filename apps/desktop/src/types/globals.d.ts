import type { Root } from "react-dom/client";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }

  var __SECOND_BRAIN_REACT_ROOT__: Root | undefined;
}

export {};
