/* ============================================================================
 * pi-diff-review-wsl - review window app
 *
 * Structure:
 *   - state.js, file-search.js, tree-renderer.js, comments.js,
 *     actions.js, host-protocol.js, and monaco-review-editor.js own the
 *     reusable browser modules.
 *   1. State
 *   2. DOM refs
 *   3. Pure helpers (escape, scope labels)
 *   4. Git-data access (scoped files, active file, comparisons, content cache)
 *   5. Monaco glue (diff editor, glyph hover, view zones, decorations)
 *   6. Comment model + modals
 *   7. Sidebar / tree rendering
 *   8. Rendering orchestration (renderTree / renderAll / mountFile)
 *   9. Message handlers (host -> webview via window.__reviewReceive)
 *  10. Event wiring + boot
 *
 * Data flows over the message channel (no inline JSON): the host sends
 * `init` then `files` once the webview posts `ready`; file contents arrive
 * lazily via `request-file` / `file-data`. See src/core/window/protocol.ts.
 * ========================================================================== */

const { createReviewData, createReviewState } = window.DiffReviewState;
const { escapeHtml } = window.DiffReviewHtml;
const { getBaseName, normalizeQuery, scoreFilePath } = window.DiffReviewFileSearch;
const {
  buildTree,
  renderSearchResults: renderSearchResultRows,
  renderTreeNode: renderTreeRows,
} = window.DiffReviewTree;
const {
  createComment,
  commentBelongsToScope,
  countCommentsForFile,
  trimSubmitComments,
} = window.DiffReviewComments;
const ReviewActions = window.DiffReviewActions;
const Host = window.DiffReviewHost;
const ReviewMonaco = window.DiffReviewMonaco;
const { showTextModal } = window.DiffReviewModal;

// ---- 1. State -------------------------------------------------------------
const reviewData = createReviewData();
const state = createReviewState();

// ---- 2. DOM refs ----------------------------------------------------------
const sidebarEl = document.getElementById("sidebar");
const sidebarTitleEl = document.getElementById("sidebar-title");
const sidebarSearchInputEl = document.getElementById("sidebar-search-input");
const toggleSidebarButton = document.getElementById("toggle-sidebar-button");
const scopeDiffButton = document.getElementById("scope-diff-button");
const scopeLastCommitButton = document.getElementById("scope-last-commit-button");
const scopeCommitButton = document.getElementById("scope-commit-button");
const scopeAllButton = document.getElementById("scope-all-button");
const commitSelectEl = document.getElementById("commit-select");
const windowTitleEl = document.getElementById("window-title");
const repoRootEl = document.getElementById("repo-root");
const fileTreeEl = document.getElementById("file-tree");
const summaryEl = document.getElementById("summary");
const currentFileLabelEl = document.getElementById("current-file-label");
const modeHintEl = document.getElementById("mode-hint");
const fileCommentsContainer = document.getElementById("file-comments-container");
const editorContainerEl = document.getElementById("editor-container");
const submitButton = document.getElementById("submit-button");
const cancelButton = document.getElementById("cancel-button");
const overallCommentButton = document.getElementById("overall-comment-button");
const fileCommentButton = document.getElementById("file-comment-button");
const toggleReviewedButton = document.getElementById("toggle-reviewed-button");
const openInNvimButton = document.getElementById("open-in-nvim-button");
const toggleUnchangedButton = document.getElementById("toggle-unchanged-button");
const toggleWrapButton = document.getElementById("toggle-wrap-button");
const loadingOverlayEl = document.getElementById("review-loading-overlay");

windowTitleEl.textContent = "Review";

let monacoApi = null;
let diffEditor = null;
let originalModel = null;
let modifiedModel = null;
let originalDecorations = [];
let modifiedDecorations = [];
let activeViewZones = [];
let editorResizeObserver = null;

// ---- 3. Data access + pure helpers ---------------------------------------
const dataAccess = window.DiffReviewDataAccess.createDataAccess({
  reviewData,
  state,
  normalizeQuery,
  scoreFilePath,
});
const {
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
} = dataAccess;

// ---- 4. File loading / selection -----------------------------------------
const { ensureFileLoaded } = window.DiffReviewFileLoader.createFileLoader({
  state,
  Host,
  ReviewActions,
  cacheKey,
  onRequestQueued: () => renderTree(),
});

function openFile(fileId) {
  if (state.activeFileId === fileId) {
    ensureFileLoaded(fileId, state.currentScope);
    return;
  }
  saveCurrentScrollPosition();
  state.activeFileId = fileId;
  renderAll({ restoreFileScroll: true });
  ensureFileLoaded(fileId, state.currentScope);
}

// ---- 5. Monaco glue -------------------------------------------------------
function saveCurrentScrollPosition() {
  if (!diffEditor || !state.activeFileId) return;
  const originalEditor = diffEditor.getOriginalEditor();
  const modifiedEditor = diffEditor.getModifiedEditor();
  state.scrollPositions[scrollKey(state.currentScope, state.activeFileId)] = {
    originalTop: originalEditor.getScrollTop(),
    originalLeft: originalEditor.getScrollLeft(),
    modifiedTop: modifiedEditor.getScrollTop(),
    modifiedLeft: modifiedEditor.getScrollLeft(),
  };
}

function restoreFileScrollPosition() {
  if (!diffEditor || !state.activeFileId) return;
  const scrollState = state.scrollPositions[scrollKey(state.currentScope, state.activeFileId)];
  if (!scrollState) return;
  const originalEditor = diffEditor.getOriginalEditor();
  const modifiedEditor = diffEditor.getModifiedEditor();
  originalEditor.setScrollTop(scrollState.originalTop);
  originalEditor.setScrollLeft(scrollState.originalLeft);
  modifiedEditor.setScrollTop(scrollState.modifiedTop);
  modifiedEditor.setScrollLeft(scrollState.modifiedLeft);
}

function captureScrollState() {
  if (!diffEditor) return null;
  const originalEditor = diffEditor.getOriginalEditor();
  const modifiedEditor = diffEditor.getModifiedEditor();
  return {
    originalTop: originalEditor.getScrollTop(),
    originalLeft: originalEditor.getScrollLeft(),
    modifiedTop: modifiedEditor.getScrollTop(),
    modifiedLeft: modifiedEditor.getScrollLeft(),
  };
}

function restoreScrollState(scrollState) {
  if (!diffEditor || !scrollState) return;
  const originalEditor = diffEditor.getOriginalEditor();
  const modifiedEditor = diffEditor.getModifiedEditor();
  originalEditor.setScrollTop(scrollState.originalTop);
  originalEditor.setScrollLeft(scrollState.originalLeft);
  modifiedEditor.setScrollTop(scrollState.modifiedTop);
  modifiedEditor.setScrollLeft(scrollState.modifiedLeft);
}

function layoutEditor() {
  if (!diffEditor) return;
  const width = editorContainerEl.clientWidth;
  const height = editorContainerEl.clientHeight;
  if (width <= 0 || height <= 0) return;
  diffEditor.layout({ width, height });
}

function clearViewZones() {
  if (!diffEditor || activeViewZones.length === 0) return;
  const original = diffEditor.getOriginalEditor();
  const modified = diffEditor.getModifiedEditor();
  original.changeViewZones((accessor) => {
    for (const zone of activeViewZones) if (zone.editor === original) accessor.removeZone(zone.id);
  });
  modified.changeViewZones((accessor) => {
    for (const zone of activeViewZones) if (zone.editor === modified) accessor.removeZone(zone.id);
  });
  activeViewZones = [];
}

function applyEditorOptions() {
  if (!diffEditor) return;
  diffEditor.updateOptions({
    renderSideBySide: activeFileShowsDiff(),
    diffWordWrap: state.wrapLines ? "on" : "off",
    hideUnchangedRegions: {
      enabled: activeFileShowsDiff() && state.hideUnchanged,
      contextLineCount: 4,
      minimumLineCount: 2,
      revealLineCount: 12,
    },
  });
  diffEditor.getOriginalEditor().updateOptions({ wordWrap: state.wrapLines ? "on" : "off" });
  diffEditor.getModifiedEditor().updateOptions({ wordWrap: state.wrapLines ? "on" : "off" });
}

function updateDecorations() {
  if (!diffEditor || !monacoApi) return;
  const file = activeFile();
  const comments = file
    ? state.comments.filter((comment) => commentBelongsToScope(comment, file.id, state.currentScope, state.selectedCommitSha) && comment.side !== "file")
    : [];
  const originalRanges = [];
  const modifiedRanges = [];
  for (const comment of comments) {
    const range = {
      range: new monacoApi.Range(comment.startLine, 1, comment.startLine, 1),
      options: {
        isWholeLine: true,
        className: comment.side === "original" ? "review-comment-line-original" : "review-comment-line-modified",
        glyphMarginClassName: comment.side === "original" ? "review-comment-glyph-original" : "review-comment-glyph-modified",
      },
    };
    if (comment.side === "original") originalRanges.push(range);
    else modifiedRanges.push(range);
  }
  originalDecorations = diffEditor.getOriginalEditor().deltaDecorations(originalDecorations, originalRanges);
  modifiedDecorations = diffEditor.getModifiedEditor().deltaDecorations(modifiedDecorations, modifiedRanges);
}

function createGlyphHoverActions(editor, side) {
  let hoverDecoration = [];

  function openDraftAtLine(line) {
    const file = activeFile();
    if (!file || !canCommentOnSide(file, side) || !isActiveFileReady()) return;
    state.comments.push(createComment({
      fileId: file.id,
      scope: state.currentScope,
      commitSha: state.currentScope === "commit" ? state.selectedCommitSha : undefined,
      side,
      startLine: line,
      endLine: line,
      body: "",
    }));
    updateCommentsUI();
    editor.revealLineInCenter(line);
  }

  editor.onMouseMove((event) => {
    const file = activeFile();
    if (!file || !canCommentOnSide(file, side) || !isActiveFileReady()) {
      hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
      return;
    }
    const target = event.target;
    if (target.type === monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || target.type === monacoApi.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
      const line = target.position?.lineNumber;
      if (!line) return;
      hoverDecoration = editor.deltaDecorations(hoverDecoration, [{
        range: new monacoApi.Range(line, 1, line, 1),
        options: { glyphMarginClassName: "review-glyph-plus" },
      }]);
    } else {
      hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
    }
  });

  editor.onMouseLeave(() => {
    hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
  });

  editor.onMouseDown((event) => {
    const file = activeFile();
    if (!file || !canCommentOnSide(file, side) || !isActiveFileReady()) return;
    const target = event.target;
    if (target.type === monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || target.type === monacoApi.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
      const line = target.position?.lineNumber;
      if (!line) return;
      openDraftAtLine(line);
    }
  });
}

function setupMonaco() {
  ReviewMonaco.configureLoader("./vendor/monaco/vs");

  window.require(["vs/editor/editor.main"], function () {
    monacoApi = window.monaco;
    ReviewMonaco.defineTheme(monacoApi);

    diffEditor = ReviewMonaco.createDiffEditor(monacoApi, editorContainerEl, {
      automaticLayout: true,
      renderSideBySide: activeFileShowsDiff(),
      readOnly: true,
      originalEditable: false,
      minimap: { enabled: true, renderCharacters: false, showSlider: "always", size: "proportional" },
      renderOverviewRuler: true,
      diffWordWrap: "on",
      scrollBeyondLastLine: false,
      lineNumbersMinChars: 4,
      glyphMargin: true,
      folding: true,
      lineDecorationsWidth: 10,
      overviewRulerBorder: false,
      wordWrap: "on",
    });

    createGlyphHoverActions(diffEditor.getOriginalEditor(), "original");
    createGlyphHoverActions(diffEditor.getModifiedEditor(), "modified");

    if (typeof ResizeObserver !== "undefined") {
      editorResizeObserver = new ResizeObserver(() => layoutEditor());
      editorResizeObserver.observe(editorContainerEl);
    }

    requestAnimationFrame(() => {
      layoutEditor();
      setTimeout(layoutEditor, 50);
      setTimeout(layoutEditor, 150);
    });

    if (state.filesReceived) mountFile();
  });
}

// ---- 6. Comment model + modals -------------------------------------------
function showOverallCommentModal() {
  showTextModal({
    title: "Overall review note",
    description: "This note is prepended to the generated prompt above the inline comments.",
    initialValue: state.overallComment,
    saveLabel: "Save note",
    onSave: (value) => {
      state.overallComment = value;
      renderTree();
    },
  });
}

function showFileCommentModal() {
  const file = activeFile();
  if (!file) return;
  showTextModal({
    title: `File comment for ${getScopeDisplayPath(file, state.currentScope)}`,
    description: `This comment applies to the whole file in ${scopeLabel(state.currentScope).toLowerCase()}.`,
    initialValue: "",
    saveLabel: "Add comment",
    onSave: (value) => {
      if (!value) return;
      state.comments.push(createComment({
        fileId: file.id,
        scope: state.currentScope,
        commitSha: state.currentScope === "commit" ? state.selectedCommitSha : undefined,
        side: "file",
        startLine: null,
        endLine: null,
        body: value,
      }));
      submitButton.disabled = false;
      updateCommentsUI();
    },
  });
}

function renderCommentDOM(comment, onDelete) {
  const container = document.createElement("div");
  container.className = "view-zone-container";
  const title = comment.side === "file"
    ? `File comment - ${scopeLabel(comment.scope)}`
    : `${comment.side === "original" ? "Original" : "Modified"} line ${comment.startLine} - ${scopeLabel(comment.scope)}`;
  container.innerHTML = `
    <div class="mb-2 flex items-center justify-between gap-3">
      <div class="text-xs font-semibold text-review-text">${escapeHtml(title)}</div>
      <button data-action="delete" class="cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-review-muted hover:bg-red-500/10 hover:text-red-400">Delete</button>
    </div>
    <textarea data-comment-id="${escapeHtml(comment.id)}" class="scrollbar-thin min-h-[76px] w-full resize-y rounded-md border border-review-border bg-[#010409] px-3 py-2 text-sm text-review-text outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="Leave a comment"></textarea>
  `;
  const textarea = container.querySelector("textarea");
  textarea.value = comment.body || "";
  textarea.addEventListener("input", () => { comment.body = textarea.value; });
  container.querySelector("[data-action='delete']").addEventListener("click", onDelete);
  if (!comment.body) setTimeout(() => textarea.focus(), 50);
  return container;
}

function syncViewZones() {
  clearViewZones();
  if (!diffEditor || !isActiveFileReady()) return;
  const file = activeFile();
  if (!file) return;
  const originalEditor = diffEditor.getOriginalEditor();
  const modifiedEditor = diffEditor.getModifiedEditor();
  const inlineComments = state.comments.filter((comment) => commentBelongsToScope(comment, file.id, state.currentScope, state.selectedCommitSha) && comment.side !== "file");
  inlineComments.forEach((item) => {
    const editor = item.side === "original" ? originalEditor : modifiedEditor;
    const domNode = renderCommentDOM(item, () => {
      state.comments = state.comments.filter((comment) => comment.id !== item.id);
      updateCommentsUI();
    });
    editor.changeViewZones((accessor) => {
      const lineCount = typeof item.body === "string" && item.body.length > 0 ? item.body.split("\n").length : 1;
      const id = accessor.addZone({
        afterLineNumber: item.startLine,
        heightInPx: Math.max(150, lineCount * 22 + 86),
        domNode,
      });
      activeViewZones.push({ id, editor });
    });
  });
}

function renderFileComments() {
  fileCommentsContainer.innerHTML = "";
  const file = activeFile();
  if (!file) {
    fileCommentsContainer.className = "hidden overflow-hidden px-0 py-0";
    return;
  }
  const fileComments = state.comments.filter((comment) => commentBelongsToScope(comment, file.id, state.currentScope, state.selectedCommitSha) && comment.side === "file");
  if (fileComments.length === 0) {
    fileCommentsContainer.className = "hidden overflow-hidden px-0 py-0";
    return;
  }
  fileCommentsContainer.className = "border-b border-review-border bg-[#0d1117] px-4 py-4 space-y-4";
  fileComments.forEach((comment) => {
    const dom = renderCommentDOM(comment, () => {
      state.comments = state.comments.filter((item) => item.id !== comment.id);
      updateCommentsUI();
    });
    dom.className = "rounded-lg border border-review-border bg-review-panel p-4";
    fileCommentsContainer.appendChild(dom);
  });
}

// ---- 7. Sidebar / tree rendering -----------------------------------------
const sidebarRenderer = window.DiffReviewSidebar.createSidebarRenderer({
  activeFile,
  activeFileShowsDiff,
  buildTree,
  commitSelectEl,
  countCommentsForFile,
  ensureActiveFileForScope,
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
  onOpenFile: openFile,
  openInNvimButton,
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
});
const { populateCommitSelect, renderTree, updateSidebarLayout, updateToggleButtons } = sidebarRenderer;

// ---- 8. Rendering orchestration ------------------------------------------
function getPlaceholderContents(file, scope) {
  const path = getScopeDisplayPath(file, scope);
  const requestState = getRequestState(file.id, scope);
  if (requestState.error) {
    const body = `Failed to load ${path}\n\n${requestState.error}`;
    return { originalContent: body, modifiedContent: body };
  }
  const body = `Loading ${path}...`;
  return { originalContent: body, modifiedContent: body };
}

function getMountedContents(file, scope = state.currentScope) {
  return getRequestState(file.id, scope).contents || getPlaceholderContents(file, scope);
}

function mountFile(options = {}) {
  if (!diffEditor || !monacoApi) return;
  const file = activeFile();
  if (!file) {
    currentFileLabelEl.textContent = "No file selected";
    clearViewZones();
    if (originalModel) originalModel.dispose();
    if (modifiedModel) modifiedModel.dispose();
    originalModel = monacoApi.editor.createModel("", "plaintext");
    modifiedModel = monacoApi.editor.createModel("", "plaintext");
    diffEditor.setModel({ original: originalModel, modified: modifiedModel });
    applyEditorOptions();
    updateDecorations();
    renderFileComments();
    requestAnimationFrame(layoutEditor);
    return;
  }
  ensureFileLoaded(file.id, state.currentScope);
  const preserveScroll = options.preserveScroll === true;
  const scrollState = preserveScroll ? captureScrollState() : null;
  const language = ReviewMonaco.inferLanguage(getScopeFilePath(file) || file.path);
  const contents = getMountedContents(file, state.currentScope);
  clearViewZones();
  currentFileLabelEl.textContent = getScopeDisplayPath(file, state.currentScope);
  if (originalModel) originalModel.dispose();
  if (modifiedModel) modifiedModel.dispose();
  originalModel = monacoApi.editor.createModel(contents.originalContent, language);
  modifiedModel = monacoApi.editor.createModel(contents.modifiedContent, language);
  diffEditor.setModel({ original: originalModel, modified: modifiedModel });
  applyEditorOptions();
  syncViewZones();
  updateDecorations();
  renderFileComments();
  requestAnimationFrame(() => {
    layoutEditor();
    if (options.restoreFileScroll) restoreFileScrollPosition();
    if (options.preserveScroll) restoreScrollState(scrollState);
    setTimeout(() => {
      layoutEditor();
      if (options.restoreFileScroll) restoreFileScrollPosition();
      if (options.preserveScroll) restoreScrollState(scrollState);
    }, 50);
  });
}

function syncCommentBodiesFromDOM() {
  const textareas = document.querySelectorAll("textarea[data-comment-id]");
  textareas.forEach((textarea) => {
    const commentId = textarea.getAttribute("data-comment-id");
    const comment = state.comments.find((item) => item.id === commentId);
    if (comment) comment.body = textarea.value;
  });
}

function updateCommentsUI() {
  renderTree();
  syncViewZones();
  updateDecorations();
  renderFileComments();
}

function renderAll(options = {}) {
  renderTree();
  submitButton.disabled = false;
  if (diffEditor && monacoApi) {
    mountFile(options);
    requestAnimationFrame(() => {
      layoutEditor();
      setTimeout(layoutEditor, 50);
    });
  } else {
    renderFileComments();
  }
}

// ---- 9. Message handlers (host -> webview) --------------------------------
function chooseInitialScope() {
  if (reviewData.files.some((file) => file.inGitDiff)) return "git-diff";
  if (reviewData.files.some((file) => file.inLastCommit)) return "last-commit";
  if (reviewData.commits.length > 0) return "commit";
  return "all-files";
}

window.__reviewReceive = function (message) {
  if (!message || typeof message !== "object") return;

  if (message.type === "init") {
    reviewData.repoRoot = message.repoRoot || "";
    reviewData.baseBranch = message.baseBranch;
    reviewData.mergeBase = message.mergeBase;
    repoRootEl.textContent = reviewData.repoRoot;
    return;
  }

  if (message.type === "files") {
    reviewData.files = message.files || [];
    reviewData.commits = message.commits || [];
    state.filesReceived = true;
    state.selectedCommitSha = reviewData.commits[0]?.sha || null;
    state.currentScope = chooseInitialScope();
    if (loadingOverlayEl) loadingOverlayEl.classList.add("hidden");
    populateCommitSelect();
    ensureActiveFileForScope();
    renderTree();
    renderFileComments();
    updateSidebarLayout();
    if (diffEditor && monacoApi) {
      mountFile({ restoreFileScroll: true });
      const file = activeFile();
      if (file) ensureFileLoaded(file.id, state.currentScope);
    }
    return;
  }

  // file-data / file-error
  const key = cacheKey(message.scope, message.fileId, message.commitSha);

  if (message.type === "file-data") {
    state.fileContents[key] = {
      originalContent: message.originalContent,
      modifiedContent: message.modifiedContent,
    };
    delete state.fileErrors[key];
    delete state.pendingRequestIds[key];
    renderTree();
    if (state.activeFileId === message.fileId && state.currentScope === message.scope && (message.scope !== "commit" || message.commitSha === state.selectedCommitSha)) {
      mountFile({ restoreFileScroll: true });
    }
    return;
  }

  if (message.type === "file-error") {
    state.fileErrors[key] = message.message || "Unknown error";
    delete state.pendingRequestIds[key];
    renderTree();
    if (state.activeFileId === message.fileId && state.currentScope === message.scope && (message.scope !== "commit" || message.commitSha === state.selectedCommitSha)) {
      mountFile({ preserveScroll: false });
    }
  }
};


function switchScope(scope) {
  const hasScopeFiles = {
    "git-diff": reviewData.files.some((file) => file.inGitDiff),
    "last-commit": reviewData.files.some((file) => file.inLastCommit),
    "commit": !!state.selectedCommitSha && reviewData.files.some((file) => file.commitComparisons?.[state.selectedCommitSha]),
    "all-files": reviewData.files.some((file) => file.hasWorkingTreeFile),
  };
  if (!hasScopeFiles[scope] || state.currentScope === scope) return;
  saveCurrentScrollPosition();
  state.currentScope = scope;
  renderAll({ restoreFileScroll: true });
  const file = activeFile();
  if (file) ensureFileLoaded(file.id, state.currentScope);
}

// ---- 10. Event wiring + boot ---------------------------------------------
submitButton.addEventListener("click", () => {
  syncCommentBodiesFromDOM();
  Host.submit(ReviewActions.createSubmitPayload(state.overallComment, trimSubmitComments(state.comments)));
  Host.close();
});

cancelButton.addEventListener("click", () => {
  Host.cancel(ReviewActions.createCancelPayload());
  Host.close();
});

overallCommentButton.addEventListener("click", () => showOverallCommentModal());
fileCommentButton.addEventListener("click", () => showFileCommentModal());

toggleUnchangedButton.addEventListener("click", () => {
  state.hideUnchanged = !state.hideUnchanged;
  applyEditorOptions();
  updateToggleButtons();
  requestAnimationFrame(layoutEditor);
});

toggleWrapButton.addEventListener("click", () => {
  state.wrapLines = !state.wrapLines;
  applyEditorOptions();
  updateToggleButtons();
  requestAnimationFrame(() => {
    layoutEditor();
    setTimeout(layoutEditor, 50);
  });
});

toggleReviewedButton.addEventListener("click", () => {
  const file = activeFile();
  if (!file) return;
  state.reviewedFiles[file.id] = !isFileReviewed(file.id);
  renderTree();
});

openInNvimButton.addEventListener("click", () => {
  const file = activeFile();
  if (!file) return;
  let line = 1;
  if (diffEditor) {
    const pos = diffEditor.getModifiedEditor().getPosition();
    if (pos && pos.lineNumber > 0) line = pos.lineNumber;
  }
  Host.openInEditor(ReviewActions.createOpenInEditorRequest({ fileId: file.id, line }));
});

scopeDiffButton.addEventListener("click", () => switchScope("git-diff"));
scopeLastCommitButton.addEventListener("click", () => switchScope("last-commit"));
scopeCommitButton.addEventListener("click", () => switchScope("commit"));
scopeAllButton.addEventListener("click", () => switchScope("all-files"));

toggleSidebarButton.addEventListener("click", () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  updateSidebarLayout();
  requestAnimationFrame(() => {
    layoutEditor();
    setTimeout(layoutEditor, 50);
  });
});

sidebarSearchInputEl.addEventListener("input", () => {
  state.fileFilter = sidebarSearchInputEl.value;
  renderTree();
});

sidebarSearchInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    sidebarSearchInputEl.value = "";
    state.fileFilter = "";
    renderTree();
  }
});

commitSelectEl.addEventListener("change", () => {
  saveCurrentScrollPosition();
  state.selectedCommitSha = commitSelectEl.value || null;
  if (state.currentScope !== "commit") state.currentScope = "commit";
  state.activeFileId = null;
  renderAll({ restoreFileScroll: true });
  const file = activeFile();
  if (file) ensureFileLoaded(file.id, state.currentScope);
});

// Boot: start Monaco (loads from ./vendor/monaco) and tell the host we are
// ready to receive `init` + `files` over the channel. The loading overlay
// stays visible until `files` arrives.
updateSidebarLayout();
setupMonaco();
Host.sendReady();
