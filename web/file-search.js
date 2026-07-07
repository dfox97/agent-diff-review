(function () {
  function getBaseName(path) {
    const parts = String(path || "").split("/");
    return parts[parts.length - 1] || path;
  }

  function normalizeQuery(query) {
    return String(query || "").trim().toLowerCase().replace(/\s+/g, "");
  }

  function scoreSubsequence(query, candidate) {
    if (!query) return 0;
    let queryIndex = 0;
    let score = 0;
    let firstMatchIndex = -1;
    let previousMatchIndex = -2;

    for (let i = 0; i < candidate.length && queryIndex < query.length; i += 1) {
      if (candidate[i] !== query[queryIndex]) continue;
      if (firstMatchIndex === -1) firstMatchIndex = i;
      score += 10;
      if (i === previousMatchIndex + 1) score += 8;
      const previousChar = i > 0 ? candidate[i - 1] : "";
      if (i === 0 || previousChar === "/" || previousChar === "_" || previousChar === "-" || previousChar === ".") {
        score += 12;
      }
      previousMatchIndex = i;
      queryIndex += 1;
    }

    if (queryIndex !== query.length) return -1;
    if (firstMatchIndex >= 0) score += Math.max(0, 20 - firstMatchIndex);
    return score;
  }

  function scoreFilePath(query, pathValue) {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) return 0;
    const path = String(pathValue || "").toLowerCase();
    const baseName = getBaseName(path);
    const pathScore = scoreSubsequence(normalizedQuery, path);
    const baseScore = scoreSubsequence(normalizedQuery, baseName);
    let score = Math.max(pathScore, baseScore >= 0 ? baseScore + 40 : -1);
    if (score < 0) return -1;
    if (baseName === normalizedQuery) score += 200;
    else if (baseName.startsWith(normalizedQuery)) score += 120;
    else if (path.includes(normalizedQuery)) score += 35;
    return score;
  }

  window.DiffReviewFileSearch = {
    getBaseName,
    normalizeQuery,
    scoreFilePath,
  };
})();
