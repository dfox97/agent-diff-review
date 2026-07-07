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
    inferLanguage,
  };
})();
