(function () {
  function createSubmitPayload(overallComment, comments) {
    return {
      type: "submit",
      overallComment: overallComment.trim(),
      comments,
    };
  }

  function createCancelPayload() {
    return { type: "cancel" };
  }

  function createFileRequest({ requestId, fileId, scope, commitSha }) {
    return { type: "request-file", requestId, fileId, scope, commitSha };
  }

  function createOpenInEditorRequest({ fileId, line }) {
    return { type: "open-in-editor", fileId, line };
  }

  window.DiffReviewActions = {
    createSubmitPayload,
    createCancelPayload,
    createFileRequest,
    createOpenInEditorRequest,
  };
})();
