(function () {
  function showTextModal(options) {
    const escapeHtml = window.DiffReviewHtml.escapeHtml;
    const backdrop = document.createElement("div");
    backdrop.className = "review-modal-backdrop";
    backdrop.innerHTML = `
      <div class="review-modal-card">
        <div class="mb-2 text-base font-semibold text-white">${escapeHtml(options.title)}</div>
        <div class="mb-4 text-sm text-review-muted">${escapeHtml(options.description)}</div>
        <textarea id="review-modal-text" class="scrollbar-thin min-h-48 w-full resize-y rounded-md border border-review-border bg-[#010409] px-3 py-2 text-sm text-review-text outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">${escapeHtml(options.initialValue ?? "")}</textarea>
        <div class="mt-4 flex justify-end gap-2">
          <button id="review-modal-cancel" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-4 py-2 text-sm font-medium text-review-text hover:bg-[#21262d]">Cancel</button>
          <button id="review-modal-save" class="cursor-pointer rounded-md border border-[rgba(240,246,252,0.1)] bg-[#238636] px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043]">${escapeHtml(options.saveLabel ?? "Save")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const textarea = backdrop.querySelector("#review-modal-text");
    const close = () => backdrop.remove();
    backdrop.querySelector("#review-modal-cancel").addEventListener("click", close);
    backdrop.querySelector("#review-modal-save").addEventListener("click", () => {
      options.onSave(textarea.value.trim());
      close();
    });
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    textarea.focus();
  }

  window.DiffReviewModal = { showTextModal };
})();
