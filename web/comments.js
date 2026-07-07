(function () {
  function createComment({ fileId, scope, commitSha, side, startLine, endLine, body = "" }) {
    return {
      id: `${Date.now()}:${Math.random().toString(16).slice(2)}`,
      fileId,
      scope,
      commitSha,
      side,
      startLine,
      endLine,
      body,
    };
  }

  function commentBelongsToScope(comment, fileId, scope, selectedCommitSha) {
    return comment.fileId === fileId
      && comment.scope === scope
      && (comment.scope !== "commit" || comment.commitSha === selectedCommitSha);
  }

  function countCommentsForFile(comments, fileId, scope, selectedCommitSha) {
    return comments.filter((comment) => commentBelongsToScope(comment, fileId, scope, selectedCommitSha)).length;
  }

  function trimSubmitComments(comments) {
    return comments
      .map((comment) => ({ ...comment, body: comment.body.trim() }))
      .filter((comment) => comment.body.length > 0);
  }

  window.DiffReviewComments = {
    createComment,
    commentBelongsToScope,
    countCommentsForFile,
    trimSubmitComments,
  };
})();
