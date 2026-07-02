// Shared light/dark theme control for the About page and the tracker.
// Runs in <head> so the theme is applied before first paint (no flash).
(function () {
  var KEY = "appr_theme";
  var root = document.documentElement;
  function current() { return localStorage.getItem(KEY) === "light" ? "light" : "dark"; }
  function apply(t) { root.setAttribute("data-theme", t === "light" ? "light" : "dark"); }
  apply(current());

  function updateBtns(t) {
    var bs = document.querySelectorAll("[data-theme-btn]");
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("active", bs[i].getAttribute("data-theme-btn") === t);
  }
  function set(t, propagate) {
    t = t === "light" ? "light" : "dark";
    localStorage.setItem(KEY, t); apply(t); updateBtns(t);
    if (propagate !== false) {
      var fs = document.querySelectorAll("iframe");
      for (var i = 0; i < fs.length; i++) { try { fs[i].contentWindow.postMessage({ __apprTheme: t }, "*"); } catch (e) {} }
    }
  }
  window.__apprSetTheme = set;

  // Keep an embedded tracker in sync when the parent page toggles.
  window.addEventListener("message", function (e) { if (e.data && e.data.__apprTheme) set(e.data.__apprTheme, false); });

  // Toggle buttons (event delegation so it works regardless of load order).
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-theme-btn]") : null;
    if (b) set(b.getAttribute("data-theme-btn"));
  });

  document.addEventListener("DOMContentLoaded", function () {
    updateBtns(current());
    // Hide the toggle only for the tracker when it is embedded inside the About page
    // (the parent then owns the theme). The About page always keeps its own toggle,
    // even when shown inside a preview iframe.
    var page = root.getAttribute("data-page");
    if (window.self !== window.top && page === "tracker") {
      var t = document.querySelectorAll(".theme-toggle");
      for (var i = 0; i < t.length; i++) t[i].style.display = "none";
    }
  });
})();
