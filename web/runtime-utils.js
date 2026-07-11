(function () {
  function reportBestEffortError(context, error) {
    // Best-effort operations should not interrupt review, but failures must be
    // diagnosable when the webview developer tools are open.
    console.warn(`[diff-review] ${context}`, error);
  }

  function createLayoutScheduler(layout) {
    let frameId = null;
    let settleTimer = null;
    let callbacks = [];

    function flush() {
      frameId = null;
      layout();
      const pending = callbacks;
      callbacks = [];
      pending.forEach((callback) => callback());

      clearTimeout(settleTimer);
      settleTimer = setTimeout(layout, 50);
    }

    function schedule(afterLayout) {
      if (afterLayout) callbacks.push(afterLayout);
      if (frameId == null) frameId = requestAnimationFrame(flush);
    }

    function dispose() {
      if (frameId != null) cancelAnimationFrame(frameId);
      clearTimeout(settleTimer);
      frameId = null;
      callbacks = [];
    }

    return { dispose, schedule };
  }

  window.DiffReviewRuntime = { createLayoutScheduler, reportBestEffortError };
})();
