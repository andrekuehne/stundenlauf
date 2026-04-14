import { legacyApiRuntime } from "./api/runtime.ts";
import type { LegacyApiBridge } from "./api/types.ts";

function missingBridge(): never {
  throw new Error("Legacy bridge has not been installed.");
}

function ensurePywebview(): LegacyApiBridge {
  if (!window.pywebview?.api) {
    window.pywebview = {
      api: {
        invoke: missingBridge,
      },
    };
  }
  return window.pywebview.api;
}

export function installLegacyBridge(): void {
  const api = ensurePywebview();
  api.invoke = (request) => legacyApiRuntime.invoke(request);
  window.dispatchEvent(new Event("pywebviewready"));
}

installLegacyBridge();
