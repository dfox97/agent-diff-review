(function () {
  function createReviewMessageHandler(deps) {
    const { reviewData, state, elements, cacheKey, activeFile, ensureActiveFileForScope,
      populateCommitSelect, renderTree, renderFileComments, updateSidebarLayout,
      mountFile, chooseInitialScope, ensureFileLoaded } = deps;

    return function receive(message) {
      if (!message || typeof message !== "object") return;

      if (message.type === "init") {
        reviewData.repoRoot = message.repoRoot || "";
        reviewData.baseBranch = message.baseBranch;
        reviewData.mergeBase = message.mergeBase;
        elements.repoRoot.textContent = reviewData.repoRoot;
        return;
      }

      if (message.type === "files") {
        reviewData.files = message.files || [];
        reviewData.commits = message.commits || [];
        state.filesReceived = true;
        state.selectedCommitSha = reviewData.commits[0]?.sha || null;
        state.currentScope = chooseInitialScope();
        elements.loadingOverlay?.classList.add("hidden");
        populateCommitSelect();
        ensureActiveFileForScope();
        renderTree();
        renderFileComments();
        updateSidebarLayout();
        mountFile({ restoreFileScroll: true });
        const file = activeFile();
        if (file) ensureFileLoaded(file.id, state.currentScope);
        return;
      }

      if (message.type !== "file-data" && message.type !== "file-error") return;
      const key = cacheKey(message.scope, message.fileId, message.commitSha);
      delete state.pendingRequestIds[key];

      if (message.type === "file-data") {
        state.fileContents[key] = {
          originalContent: message.originalContent,
          modifiedContent: message.modifiedContent,
        };
        delete state.fileErrors[key];
      } else {
        state.fileErrors[key] = message.message || "Unknown error";
      }

      renderTree();
      const isCurrent = state.activeFileId === message.fileId &&
        state.currentScope === message.scope &&
        (message.scope !== "commit" || message.commitSha === state.selectedCommitSha);
      if (isCurrent) mountFile(message.type === "file-data" ? { restoreFileScroll: true } : {});
    };
  }

  window.DiffReviewMessages = { createReviewMessageHandler };
})();
