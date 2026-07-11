(function () {
  function createDataAccess({ reviewData, state, normalizeQuery, scoreFilePath }) {
    function scopeLabel(scope) {
      switch (scope) {
        case "git-diff": return reviewData.baseBranch ? `Branch diff vs ${reviewData.baseBranch}` : "Git diff";
        case "last-commit": return "Last commit";
        case "commit": return "Commit history";
        default: return "All files";
      }
    }

    function scopeHint(scope) {
      switch (scope) {
        case "git-diff":
          return reviewData.baseBranch
            ? `Review all branch changes against ${reviewData.baseBranch}. Hover or click line numbers in the gutter to add an inline comment.`
            : "Review working tree changes against HEAD. Hover or click line numbers in the gutter to add an inline comment.";
        case "last-commit":
          return "Review the last commit against its parent. Hover or click line numbers in the gutter to add an inline comment.";
        case "commit":
          return "Review the selected past commit against its parent. Use the commit dropdown in the sidebar to move through history.";
        default:
          return "Review the current working tree snapshot. Hover or click line numbers in the gutter to add a code review comment.";
      }
    }

    function statusLabel(status) {
      if (!status) return "";
      return status.charAt(0).toUpperCase() + status.slice(1);
    }

    function statusBadgeClass(status) {
      switch (status) {
        case "added": return "text-[#3fb950]";
        case "deleted": return "text-[#f85149]";
        case "renamed": return "text-[#d29922]";
        default: return "text-[#58a6ff]";
      }
    }

    function isFileReviewed(fileId) {
      return state.reviewedFiles[fileId] === true;
    }

    function getScopedFiles() {
      switch (state.currentScope) {
        case "git-diff": return reviewData.files.filter((file) => file.inGitDiff);
        case "last-commit": return reviewData.files.filter((file) => file.inLastCommit);
        case "commit": return reviewData.files.filter((file) => state.selectedCommitSha && file.commitComparisons?.[state.selectedCommitSha]);
        default: return reviewData.files.filter((file) => file.hasWorkingTreeFile);
      }
    }

    function ensureActiveFileForScope() {
      const scopedFiles = getScopedFiles();
      if (scopedFiles.length === 0) {
        state.activeFileId = null;
        return;
      }
      if (!scopedFiles.some((file) => file.id === state.activeFileId)) state.activeFileId = scopedFiles[0].id;
    }

    function activeFile() {
      return reviewData.files.find((file) => file.id === state.activeFileId) ?? null;
    }

    function getScopeComparison(file, scope = state.currentScope) {
      if (!file) return null;
      if (scope === "git-diff") return file.gitDiff;
      if (scope === "last-commit") return file.lastCommit;
      if (scope === "commit") return state.selectedCommitSha ? file.commitComparisons?.[state.selectedCommitSha] ?? null : null;
      return null;
    }

    function activeComparison() {
      return getScopeComparison(activeFile(), state.currentScope);
    }

    function activeFileShowsDiff() {
      return activeComparison() != null;
    }

    function getScopeFilePath(file) {
      const comparison = getScopeComparison(file, state.currentScope);
      return comparison?.newPath || comparison?.oldPath || file?.path || "";
    }

    function getScopeDisplayPath(file, scope = state.currentScope) {
      const comparison = getScopeComparison(file, scope);
      return comparison?.displayPath || file?.path || "";
    }

    function getFileSearchPath(file) {
      return file?.path || "";
    }

    function getActiveStatus(file) {
      const comparison = getScopeComparison(file, state.currentScope);
      return comparison?.status ?? file?.worktreeStatus ?? null;
    }

    function getFilteredFiles() {
      const scopedFiles = getScopedFiles();
      const query = state.fileFilter.trim();
      if (!query) return [...scopedFiles];
      const normalizedQuery = normalizeQuery(query);
      return scopedFiles
        .map((file) => ({ file, score: normalizedQuery ? scoreFilePath(normalizedQuery, getFileSearchPath(file)) : 0 }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => b.score - a.score || getFileSearchPath(a.file).localeCompare(getFileSearchPath(b.file)))
        .map((entry) => entry.file);
    }

    function scopeInstanceKey(scope, commitSha = state.selectedCommitSha) {
      return scope === "commit" ? `${scope}:${commitSha || ""}` : scope;
    }

    function cacheKey(scope, fileId, commitSha) {
      return `${scopeInstanceKey(scope, commitSha)}:${fileId}`;
    }

    function scrollKey(scope, fileId) {
      return `${scopeInstanceKey(scope)}:${fileId}`;
    }

    function getRequestState(fileId, scope = state.currentScope) {
      const key = cacheKey(scope, fileId);
      return {
        contents: state.fileContents[key],
        error: state.fileErrors[key],
        requestId: state.pendingRequestIds[key],
      };
    }

    function canCommentOnSide(file, side) {
      if (!file) return false;
      const comparison = activeComparison();
      if (side === "original") return comparison != null && comparison.hasOriginal;
      return comparison != null ? comparison.hasModified : file.hasWorkingTreeFile;
    }

    function isActiveFileReady() {
      const file = activeFile();
      if (!file) return false;
      const requestState = getRequestState(file.id, state.currentScope);
      return requestState.contents != null && requestState.error == null;
    }

    return {
      activeComparison,
      activeFile,
      activeFileShowsDiff,
      cacheKey,
      canCommentOnSide,
      ensureActiveFileForScope,
      getActiveStatus,
      getFileSearchPath,
      getFilteredFiles,
      getRequestState,
      getScopeDisplayPath,
      getScopeFilePath,
      getScopedFiles,
      isActiveFileReady,
      isFileReviewed,
      scopeHint,
      scopeLabel,
      scrollKey,
      statusBadgeClass,
      statusLabel,
    };
  }

  window.DiffReviewDataAccess = { createDataAccess };
})();
