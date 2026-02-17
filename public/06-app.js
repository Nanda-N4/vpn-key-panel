(function () {
  const modal = document.getElementById("announceModal");
  if (!modal) return;

  const version = (modal.getAttribute("data-version") || "").trim();
  const key = "announce_closed_version";

  function show() {
    modal.classList.remove("is-hidden");
    document.documentElement.classList.add("modal-open");
  }

  function hide() {
    modal.classList.add("is-hidden");
    document.documentElement.classList.remove("modal-open");
    if (version) {
      try { localStorage.setItem(key, version); } catch (_) {}
    }
  }

  // Close on X / OK
  modal.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", hide);
  });

  // Close on overlay click (outside card)
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hide();
  });

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });

  // Decide show/hide
  let closed = "";
  try { closed = localStorage.getItem(key) || ""; } catch (_) {}

  // If version changed -> show again
  if (!version || closed !== version) {
    show();
  }
})();
