(function () {
  function createSidebarRenderer(deps) {
    const {
      buildTree,
      commitSelectEl,
      countCommentsForFile,
      escapeHtml,
      fileTreeEl,
      getActiveStatus,
      getBaseName,
      getFileSearchPath,
      getFilteredFiles,
      getRequestState,
      getScopedFiles,
      isFileReviewed,
      modeHintEl,
      onOpenFile,
      renderSearchResultRows,
      renderTreeRows,
      reviewData,
      scopeAllButton,
      scopeCommitButton,
      scopeDiffButton,
      scopeHint,
      scopeLabel,
      scopeLastCommitButton,
      sidebarEl,
      sidebarTitleEl,
      state,
      statusBadgeClass,
      statusLabel,
      submitButton,
      summaryEl,
      toggleReviewedButton,
      toggleSidebarButton,
      toggleUnchangedButton,
      toggleWrapButton,
      openInNvimButton,
      activeFile,
      activeFileShowsDiff,
      ensureActiveFileForScope,
    } = deps;

    function createTreeRenderOptions(renderTree) {
      return {
        container: fileTreeEl,
        state,
        countComments: (file) => countCommentsForFile(state.comments, file.id, state.currentScope, state.selectedCommitSha),
        escapeHtml,
        getBaseName,
        getPath: getFileSearchPath,
        getRequestState: (fileId) => getRequestState(fileId, state.currentScope),
        getStatus: getActiveStatus,
        isFileReviewed,
        onOpenFile,
        onToggleDirectory: renderTree,
        statusBadgeClass,
        statusLabel,
      };
    }

    function updateSidebarLayout() {
      const collapsed = state.sidebarCollapsed;
      sidebarEl.style.width = collapsed ? "0px" : "280px";
      sidebarEl.style.minWidth = collapsed ? "0px" : "280px";
      sidebarEl.style.flexBasis = collapsed ? "0px" : "280px";
      sidebarEl.style.borderRightWidth = collapsed ? "0px" : "1px";
      sidebarEl.style.pointerEvents = collapsed ? "none" : "auto";
      toggleSidebarButton.textContent = collapsed ? "Show sidebar" : "Hide sidebar";
    }

    function updateScopeButtons() {
      const counts = {
        diff: reviewData.files.filter((file) => file.inGitDiff).length,
        lastCommit: reviewData.files.filter((file) => file.inLastCommit).length,
        commit: state.selectedCommitSha ? reviewData.files.filter((file) => file.commitComparisons?.[state.selectedCommitSha]).length : 0,
        all: reviewData.files.filter((file) => file.hasWorkingTreeFile).length,
      };
      const applyButtonClasses = (button, active, disabled) => {
        button.disabled = disabled;
        button.className = disabled
          ? "cursor-default rounded-md border border-review-border bg-[#11161d] px-2.5 py-1 text-[11px] font-medium text-review-muted opacity-60"
          : active
            ? "cursor-pointer rounded-md border border-[#2ea043]/40 bg-[#238636]/15 px-2.5 py-1 text-[11px] font-medium text-[#3fb950] hover:bg-[#238636]/25"
            : "cursor-pointer rounded-md border border-review-border bg-review-panel px-2.5 py-1 text-[11px] font-medium text-review-text hover:bg-[#21262d]";
      };
      scopeDiffButton.textContent = `${scopeLabel("git-diff")}${counts.diff > 0 ? ` (${counts.diff})` : ""}`;
      scopeLastCommitButton.textContent = `Last commit${counts.lastCommit > 0 ? ` (${counts.lastCommit})` : ""}`;
      scopeCommitButton.textContent = `Commits${counts.commit > 0 ? ` (${counts.commit})` : ""}`;
      scopeAllButton.textContent = `All files${counts.all > 0 ? ` (${counts.all})` : ""}`;
      applyButtonClasses(scopeDiffButton, state.currentScope === "git-diff", counts.diff === 0);
      applyButtonClasses(scopeLastCommitButton, state.currentScope === "last-commit", counts.lastCommit === 0);
      applyButtonClasses(scopeCommitButton, state.currentScope === "commit", !state.selectedCommitSha || counts.commit === 0);
      applyButtonClasses(scopeAllButton, state.currentScope === "all-files", counts.all === 0);
      commitSelectEl.className = state.currentScope === "commit"
        ? "mb-3 block w-full rounded-md border border-review-border bg-review-panel px-2 py-2 text-xs text-review-text outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        : "mb-3 hidden w-full rounded-md border border-review-border bg-review-panel px-2 py-2 text-xs text-review-text outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
    }

    function updateToggleButtons() {
      const file = activeFile();
      const reviewed = file ? isFileReviewed(file.id) : false;
      toggleReviewedButton.textContent = reviewed ? "Reviewed" : "Mark reviewed";
      toggleReviewedButton.className = reviewed
        ? "cursor-pointer rounded-md border border-[#2ea043]/40 bg-[#238636]/15 px-3 py-1 text-xs font-medium text-[#3fb950] hover:bg-[#238636]/25"
        : "cursor-pointer rounded-md border border-review-border bg-review-panel px-3 py-1 text-xs font-medium text-review-text hover:bg-[#21262d]";
      toggleWrapButton.textContent = `Wrap lines: ${state.wrapLines ? "on" : "off"}`;
      toggleUnchangedButton.textContent = state.hideUnchanged ? "Show full file" : "Show changed areas only";
      toggleUnchangedButton.style.display = activeFileShowsDiff() ? "inline-flex" : "none";
      openInNvimButton.disabled = file == null;
      updateScopeButtons();
      modeHintEl.textContent = scopeHint(state.currentScope);
      submitButton.disabled = false;
    }

    function renderTree() {
      ensureActiveFileForScope();
      fileTreeEl.innerHTML = "";
      const scopedFiles = getScopedFiles();
      const visibleFiles = getFilteredFiles();
      if (visibleFiles.length === 0) {
        const message = state.fileFilter.trim()
          ? `No files match <span class="text-review-text">${escapeHtml(state.fileFilter.trim())}</span>.`
          : `No files in <span class="text-review-text">${escapeHtml(scopeLabel(state.currentScope).toLowerCase())}</span>.`;
        fileTreeEl.innerHTML = `<div class="px-3 py-4 text-sm text-review-muted">${message}</div>`;
      } else if (state.fileFilter.trim()) {
        renderSearchResultRows(visibleFiles, createTreeRenderOptions(renderTree));
      } else {
        renderTreeRows(buildTree(visibleFiles, getFileSearchPath), 0, createTreeRenderOptions(renderTree));
      }
      sidebarTitleEl.textContent = scopeLabel(state.currentScope);
      const comments = state.comments.length;
      const filteredSuffix = state.fileFilter.trim() ? ` - ${visibleFiles.length} shown` : "";
      summaryEl.textContent = `${scopedFiles.length} file(s) - ${comments} comment(s)${state.overallComment ? " - overall note" : ""}${filteredSuffix}`;
      updateToggleButtons();
      updateSidebarLayout();
    }

    function populateCommitSelect() {
      commitSelectEl.innerHTML = "";
      (reviewData.commits || []).forEach((commit) => {
        const option = document.createElement("option");
        option.value = commit.sha;
        option.textContent = `${commit.shortSha} ${commit.subject}`;
        commitSelectEl.appendChild(option);
      });
      if (state.selectedCommitSha) commitSelectEl.value = state.selectedCommitSha;
    }

    return { populateCommitSelect, renderTree, updateSidebarLayout, updateToggleButtons };
  }

  window.DiffReviewSidebar = { createSidebarRenderer };
})();
