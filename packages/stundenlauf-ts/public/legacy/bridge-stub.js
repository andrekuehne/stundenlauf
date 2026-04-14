/**
 * Dev/browser bridge shim for the legacy pywebview frontend.
 * The TS port can serve the old frontend before backend wiring exists.
 */
(function (global) {
  function buildUnavailableResponse(request) {
    return Promise.resolve({
      status: "error",
      request_id: request && typeof request.request_id === "string" ? request.request_id : "legacy_stub",
      error: {
        code: "backend_unavailable",
        message:
          "TS backend wiring is not active yet. This legacy frontend runs in frontend-only mode.",
      },
    });
  }

  if (!global.pywebview) {
    global.pywebview = {};
  }
  if (!global.pywebview.api) {
    global.pywebview.api = {};
  }
  if (typeof global.pywebview.api.invoke !== "function") {
    global.pywebview.api.invoke = buildUnavailableResponse;
  }
})(window);
