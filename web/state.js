(function () {
  function createReviewData() {
    return {
      repoRoot: "",
      files: [],
      commits: [],
      baseBranch: undefined,
      mergeBase: undefined,
    };
  }

  function createReviewState() {
    return {
      activeFileId: null,
      currentScope: "git-diff",
      comments: [],
      overallComment: "",
      hideUnchanged: false,
      wrapLines: true,
      collapsedDirs: {},
      reviewedFiles: {},
      scrollPositions: {},
      sidebarCollapsed: false,
      fileFilter: "",
      selectedCommitSha: null,
      fileContents: {},
      fileErrors: {},
      pendingRequestIds: {},
      filesReceived: false,
    };
  }

  window.DiffReviewState = {
    createReviewData,
    createReviewState,
  };
})();
