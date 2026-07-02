// Sticky side-nav scroll-spy for the About page, with a sliding position marker.
(function () {
  var sections = Array.prototype.slice.call(document.querySelectorAll(".section[id]"));
  var links = {};
  document.querySelectorAll(".rail a[href^='#']").forEach(function (a) {
    links[a.getAttribute("href").slice(1)] = a;
  });

  // Marker bar that glides to whichever rail link is active.
  var rail = document.querySelector(".rail");
  var marker = null;
  if (rail) {
    marker = document.createElement("span");
    marker.className = "rail-marker";
    marker.setAttribute("aria-hidden", "true");
    rail.appendChild(marker);
  }
  function moveMarker(a) {
    if (!marker || !a) return;
    marker.style.top = a.offsetTop + "px";
    marker.style.height = a.offsetHeight + "px";
    marker.classList.add("on");
  }

  // Highlight the rail link for whichever section is currently in view.
  // Plain scroll listener (no IntersectionObserver) so it behaves identically everywhere.
  function currentSection() {
    var probe = window.scrollY + window.innerHeight * 0.35;
    var cur = sections[0];
    sections.forEach(function (s) {
      if (s.getBoundingClientRect().top + window.scrollY <= probe) cur = s;
    });
    return cur;
  }
  var lastId = null;
  function updateSpy() {
    if (!sections.length) return;
    // At the very bottom the last (short) section can never reach the probe line — force it.
    var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    var id = atBottom ? sections[sections.length - 1].id : currentSection().id;
    if (id === lastId) return;
    lastId = id;
    Object.keys(links).forEach(function (k) {
      var on = k === id;
      links[k].classList.toggle("active", on);
      if (on) { links[k].setAttribute("aria-current", "true"); moveMarker(links[k]); }
      else links[k].removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", updateSpy, { passive: true });
  window.addEventListener("resize", function () {
    lastId = null;                       // force a recompute after reflow
    updateSpy();
    moveMarker(document.querySelector(".rail a.active"));
  });
  updateSpy();
})();

// Collapsible embedded tracker.
(function () {
  var btn = document.querySelector(".embed-toggle");
  if (!btn) return;
  var wrap = document.getElementById(btn.getAttribute("aria-controls"));
  if (!wrap) return;
  btn.addEventListener("click", function () {
    var collapsed = wrap.classList.toggle("collapsed");
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.textContent = collapsed ? "Show live tracker" : "Hide live tracker";
  });
})();

// Skeleton loaders for embedded iframes (live tracker + PDF viewers).
// Each iframe is wrapped and overlaid with a shimmering placeholder that fades
// out once the frame fires its load event (with an 8s fail-safe so it never sticks).
(function () {
  function markup(label) {
    return '<div class="skbar t"></div><div class="skbar w90"></div>' +
           '<div class="skbar w70"></div><div class="skbar w80"></div>' +
           '<div class="skbar w50"></div><div class="sk-spacer"></div>' +
           '<div class="sk-foot"><span class="sk-dot"></span>' + label + '</div>';
  }
  function attach(iframe, kind, label) {
    if (!iframe) return;
    var wrap = document.createElement("div");
    wrap.className = "frame-wrap k-" + kind;
    iframe.parentNode.insertBefore(wrap, iframe);
    wrap.appendChild(iframe);                 // moving the iframe re-triggers its load
    var skel = document.createElement("div");
    skel.className = "frame-skel";
    skel.setAttribute("aria-hidden", "true");
    skel.innerHTML = markup(label);
    wrap.appendChild(skel);
    var done = false;
    function finish() { if (done) return; done = true; wrap.classList.add("loaded"); }
    iframe.addEventListener("load", function () { setTimeout(finish, 200); });
    setTimeout(finish, 8000);
  }
  attach(document.querySelector(".embed-frame"), "embed", "Loading live tracker\u2026");
  document.querySelectorAll(".deck-frame").forEach(function (f) { attach(f, "deck", "Loading slides\u2026"); });
  attach(document.querySelector(".doc-frame"), "doc", "Loading document\u2026");
})();

