/* Runs before first paint: applies the saved theme and refuses to be framed by other sites. */
(function () {
  try {
    var saved = window.localStorage.getItem("zerone-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (e) { /* storage unavailable: follow the system theme */ }

  if (window.top !== window.self) {
    try {
      window.top.location.replace(window.self.location.href);
    } catch (e) {
      document.documentElement.style.display = "none";
    }
  }
})();
