/**
 * Legacy bridge bootstrapper.
 *
 * Load the real TypeScript compatibility adapter first, then execute the
 * copied legacy frontend script so startup never races against a stubbed
 * `window.pywebview.api.invoke`.
 */
(function bootstrapLegacyFrontend() {
  // Prefer the production bundle first. In Vite preview/static hosting,
  // importing /src/*.ts is blocked by MIME checks and can break bridge boot.
  const bridgeReady = import("../assets/legacy-bridge.js").catch(() =>
    import("/src/legacy/bridge-entry.ts"),
  );

  function installFallbackBridge() {
    if (!window.pywebview) {
      window.pywebview = {};
    }
    if (!window.pywebview.api) {
      window.pywebview.api = {};
    }
    window.pywebview.api.invoke = function invokeUnavailable(request) {
      return Promise.resolve({
        status: "error",
        request_id:
          request && typeof request.request_id === "string"
            ? request.request_id
            : "legacy_stub",
        error: {
          code: "backend_unavailable",
          message: "TS backend wiring is not active yet.",
          details: {
            message: "TS backend wiring is not active yet.",
          },
        },
      });
    };
    window.dispatchEvent(new Event("pywebviewready"));
  }

  function loadApp() {
    const script = document.createElement("script");
    script.src = "./app.js";
    document.body.appendChild(script);
  }

  bridgeReady.then(loadApp).catch((error) => {
    console.error("Failed to load legacy bridge entry.", error);
    installFallbackBridge();
    loadApp();
  });
})();
