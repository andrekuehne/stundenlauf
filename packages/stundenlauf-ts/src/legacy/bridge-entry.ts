import { legacyApiRuntime } from "./api/runtime.ts";
import type { LegacyApiBridge, LegacyApiRequest } from "./api/types.ts";

function ensurePywebview(): LegacyApiBridge {
  if (!window.pywebview) {
    window.pywebview = {
      api: {
        invoke: (_request: LegacyApiRequest) => {
          throw new Error("Legacy bridge has not been installed.");
        },
      },
    };
  }
  if (!window.pywebview.api) {
    window.pywebview.api = {
      invoke: (_request: LegacyApiRequest) => {
        throw new Error("Legacy bridge has not been installed.");
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
