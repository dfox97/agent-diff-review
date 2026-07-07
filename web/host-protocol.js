(function () {
  function send(message) {
    if (window.glimpse?.send) window.glimpse.send(message);
  }

  function close() {
    if (window.glimpse?.close) window.glimpse.close();
  }

  function sendReady() {
    send({ type: "ready" });
  }

  window.DiffReviewHost = {
    send,
    close,
    sendReady,
    requestFile: send,
    openInEditor: send,
    submit: send,
    cancel: send,
  };
})();
