(function () {
  function createFileLoader({ state, Host, ReviewActions, cacheKey, onRequestQueued }) {
    let requestSequence = 0;

    function ensureFileLoaded(fileId, scope = state.currentScope) {
      if (!fileId) return;
      const key = cacheKey(scope, fileId);
      if (state.fileContents[key] != null || state.fileErrors[key] != null || state.pendingRequestIds[key] != null) return;
      const requestId = `request:${Date.now()}:${++requestSequence}`;
      state.pendingRequestIds[key] = requestId;
      onRequestQueued();
      Host.requestFile(ReviewActions.createFileRequest({
        requestId,
        fileId,
        scope,
        commitSha: scope === "commit" ? state.selectedCommitSha : undefined,
      }));
    }

    return { ensureFileLoaded };
  }

  window.DiffReviewFileLoader = { createFileLoader };
})();
