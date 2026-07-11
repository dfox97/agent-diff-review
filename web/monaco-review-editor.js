(function () {
  function configureLoader(vsPath) {
    window.require.config({
      paths: { vs: vsPath },
    });
  }

  function defineTheme(monacoApi) {
    monacoApi.editor.defineTheme("review-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0d1117",
        "diffEditor.insertedTextBackground": "#2ea04326",
        "diffEditor.removedTextBackground": "#f8514926",
      },
    });
    monacoApi.editor.setTheme("review-dark");
  }

  function createDiffEditor(monacoApi, container, options) {
    return monacoApi.editor.createDiffEditor(container, options);
  }

  function createLifecycle(monacoApi, diffEditor, container, scheduleLayout) {
    const originalModel = monacoApi.editor.createModel("", "plaintext");
    const modifiedModel = monacoApi.editor.createModel("", "plaintext");
    diffEditor.setModel({ original: originalModel, modified: modifiedModel });

    function setContents(originalContent, modifiedContent, language) {
      // Keep model identity stable. Recreating models for every lazy-load state
      // forces Monaco to rebuild tokenization, diff workers, and editor state.
      if (originalModel.getLanguageId() !== language) monacoApi.editor.setModelLanguage(originalModel, language);
      if (modifiedModel.getLanguageId() !== language) monacoApi.editor.setModelLanguage(modifiedModel, language);
      if (originalModel.getValue() !== originalContent) originalModel.setValue(originalContent);
      if (modifiedModel.getValue() !== modifiedContent) modifiedModel.setValue(modifiedContent);
    }

    function layout() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) diffEditor.layout({ width, height });
    }

    function dispose() {
      originalModel.dispose();
      modifiedModel.dispose();
    }

    return { dispose, layout, scheduleLayout, setContents };
  }

  function inferLanguage(path) {
    if (!path) return "plaintext";
    const lower = path.toLowerCase();
    if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
    if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
    if (lower.endsWith(".json")) return "json";
    if (lower.endsWith(".md")) return "markdown";
    if (lower.endsWith(".css")) return "css";
    if (lower.endsWith(".html")) return "html";
    if (lower.endsWith(".sh")) return "shell";
    if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
    if (lower.endsWith(".rs")) return "rust";
    if (lower.endsWith(".java")) return "java";
    if (lower.endsWith(".kt")) return "kotlin";
    if (lower.endsWith(".py")) return "python";
    if (lower.endsWith(".go")) return "go";
    return "plaintext";
  }

  window.DiffReviewMonaco = {
    configureLoader,
    defineTheme,
    createDiffEditor,
    createLifecycle,
    inferLanguage,
  };
})();
