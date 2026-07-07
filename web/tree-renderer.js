(function () {
  function buildTree(files, getPath) {
    const root = { name: "", path: "", kind: "dir", children: new Map(), file: null };
    for (const file of files) {
      const path = getPath(file);
      const parts = path.split("/");
      let node = root;
      let currentPath = "";
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        const isLeaf = i === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!node.children.has(part)) {
          node.children.set(part, {
            name: part,
            path: currentPath,
            kind: isLeaf ? "file" : "dir",
            children: new Map(),
            file: isLeaf ? file : null,
          });
        }
        node = node.children.get(part);
        if (isLeaf) node.file = file;
      }
    }
    return root;
  }

  function renderTreeNode(node, depth, options) {
    const children = [...node.children.values()].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    const indentPx = 12;
    for (const child of children) {
      if (child.kind === "dir") {
        const collapsed = options.state.collapsedDirs[child.path] === true;
        const row = document.createElement("button");
        row.type = "button";
        row.className = "group flex w-full items-center gap-1.5 px-2 py-1 text-left text-[13px] text-[#c9d1d9] hover:bg-[#21262d]";
        row.style.paddingLeft = `${depth * indentPx + 8}px`;
        row.innerHTML = `
          <svg class="h-4 w-4 shrink-0 text-[#8b949e] transition-transform ${collapsed ? "-rotate-90" : ""}" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.78 6.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 7.28a.749.749 0 0 1 1.06-1.06L8 9.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"></path>
          </svg>
          <span class="truncate">${options.escapeHtml(child.name)}</span>
        `;
        row.addEventListener("click", () => {
          options.state.collapsedDirs[child.path] = !collapsed;
          options.onToggleDirectory();
        });
        options.container.appendChild(row);
        if (!collapsed) renderTreeNode(child, depth + 1, options);
        continue;
      }

      const file = child.file;
      const count = options.countComments(file);
      const reviewed = options.isFileReviewed(file.id);
      const requestState = options.getRequestState(file.id);
      const loading = requestState.requestId != null && requestState.contents == null;
      const errored = requestState.error != null;
      const status = options.getStatus(file);
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "group flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[13px]",
        file.id === options.state.activeFileId ? "bg-[#373e47] text-white" : reviewed ? "text-[#c9d1d9] hover:bg-[#21262d]" : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9]",
      ].join(" ");
      button.style.paddingLeft = `${(depth * indentPx) + 26}px`;
      button.innerHTML = `
        <span class="flex min-w-0 items-center gap-1.5 truncate ${file.id === options.state.activeFileId ? "font-medium" : ""}">
          <span class="shrink-0 text-[10px] ${reviewed ? "text-[#3fb950]" : errored ? "text-red-400" : loading ? "text-[#58a6ff]" : "text-transparent"}">${reviewed ? "*" : errored ? "!" : loading ? "..." : "*"}</span>
          <span class="truncate">${options.escapeHtml(child.name)}</span>
        </span>
        <span class="flex shrink-0 items-center gap-1.5">
          ${count > 0 ? `<span class="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#1f2937] px-1 text-[10px] font-medium text-[#c9d1d9]">${count}</span>` : ""}
          ${status ? `<span class="font-medium ${options.statusBadgeClass(status)}">${options.escapeHtml(options.statusLabel(status).charAt(0))}</span>` : ""}
        </span>
      `;
      button.addEventListener("click", () => options.onOpenFile(file.id));
      options.container.appendChild(button);
    }
  }

  function renderSearchResults(files, options) {
    files.forEach((file) => {
      const path = options.getPath(file);
      const baseName = options.getBaseName(path);
      const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const count = options.countComments(file);
      const reviewed = options.isFileReviewed(file.id);
      const requestState = options.getRequestState(file.id);
      const loading = requestState.requestId != null && requestState.contents == null;
      const errored = requestState.error != null;
      const status = options.getStatus(file);
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "group flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left",
        file.id === options.state.activeFileId ? "bg-[#373e47] text-white" : "text-[#c9d1d9] hover:bg-[#21262d]",
      ].join(" ");
      button.innerHTML = `
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="shrink-0 text-[10px] ${reviewed ? "text-[#3fb950]" : errored ? "text-red-400" : loading ? "text-[#58a6ff]" : "text-transparent"}">${reviewed ? "*" : errored ? "!" : loading ? "..." : "*"}</span>
            <span class="truncate text-[13px] ${file.id === options.state.activeFileId ? "font-medium" : ""}">${options.escapeHtml(baseName)}</span>
          </span>
          <span class="mt-0.5 block truncate pl-[14px] text-[11px] ${file.id === options.state.activeFileId ? "text-[#c9d1d9]" : "text-review-muted"}">${options.escapeHtml(parentPath || path)}</span>
        </span>
        <span class="flex shrink-0 items-center gap-1.5">
          ${count > 0 ? `<span class="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#1f2937] px-1 text-[10px] font-medium text-[#c9d1d9]">${count}</span>` : ""}
          ${status ? `<span class="font-medium ${options.statusBadgeClass(status)}">${options.escapeHtml(options.statusLabel(status).charAt(0))}</span>` : ""}
        </span>
      `;
      button.addEventListener("click", () => options.onOpenFile(file.id));
      options.container.appendChild(button);
    });
  }

  window.DiffReviewTree = {
    buildTree,
    renderSearchResults,
    renderTreeNode,
  };
})();
