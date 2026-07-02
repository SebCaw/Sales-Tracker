const MONTHS = ["Aug","Sep","Oct","Nov","Dec","Jan","Feb"];
const MONTH_NUM = [8,9,10,11,12,1,2];
const STATUS_OPTS = ["watching","applied","interview","offer","rejected","not_applying"];
const STATUS_LABEL = { watching:"Watching", applied:"Applied", interview:"Interview", offer:"Offer", rejected:"Rejected", not_applying:"Not applying" };

let activeSector = "all";
let activeStatFilter = null;   // "open" | "closing_soon" | "applied" | "watching"
let closingWithin = "any";
let chartsAnimated = false;    // chart bars draw in on the first render only, not on re-filters

// PowerShell's ConvertTo-Json serialises a single-element array as a bare object,
// so any list that can have exactly one item is coerced back to an array here.
function asArr(x){ return Array.isArray(x) ? x : (x == null ? [] : [x]); }

// ---------- localStorage user tracking ----------
function userKey(pid){ return "appr_user_" + pid; }
function getUser(pid){
  try { return JSON.parse(localStorage.getItem(userKey(pid))) || { userStatus:"watching", userAppliedDate:null, userNotes:"" }; }
  catch(e){ return { userStatus:"watching", userAppliedDate:null, userNotes:"" }; }
}
function setUser(pid, data){ localStorage.setItem(userKey(pid), JSON.stringify(data)); }

// ---------- helpers ----------
function daysUntil(iso){ if(!iso) return null; const d=(new Date(iso)-new Date())/86400000; return Math.ceil(d); }
function fmtDate(iso){ if(!iso) return ""; return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); }
function todayISO(){ return new Date().toISOString().slice(0,10); }

// Effective live status (recompute closing_soon from closingDate)
function liveStatus(p){
  if(p.status === "open" || p.status === "closing_soon"){
    const d = daysUntil(p.closingDate);
    if(d !== null && d < 0) return "closed";
    if(d !== null && d <= 14) return "closing_soon";
    return "open";
  }
  return p.status || "not_open";
}
const BADGE_TXT = { open:"Open", closing_soon:"Closing soon", closed:"Closed", not_open:"Not yet open" };

// Predicted next opening from historical cycles
function predictOpen(company){
  if(!company.historicalCycles || !company.historicalCycles.length) return null;
  const m = Math.round(company.historicalCycles.reduce((s,c)=>s+c.openedMonth,0)/company.historicalCycles.length);
  const now = new Date();
  let year = now.getFullYear();
  if(now.getMonth()+1 > m) year++;            // window for this year already passed
  const target = new Date(year, m-1, 1);
  const days = Math.ceil((target - now)/86400000);
  return { month: m, days };
}
const MN = ["","January","February","March","April","May","June","July","August","September","October","November","December"];

// ---------- render ----------
function render(){
  const data = window.TRACKER_DATA;
  const meta = data.meta;

  // Header freshness — before activeFrom, show a calm "scheduled" state instead of a stale warning
  const pulse = document.getElementById("pulse");
  const notYetActive = meta.activeFrom && new Date() < new Date(meta.activeFrom + "T00:00:00");
  if(notYetActive){
    pulse.className = "pulse amber";
    const d = new Date(meta.activeFrom + "T00:00:00");
    document.getElementById("updatedTxt").textContent = "Checks begin " + d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  } else {
    const ageH = (new Date() - new Date(meta.lastUpdated)) / 3600000;
    pulse.className = "pulse" + (ageH > 24 ? " red" : ageH > 12 ? " amber" : "");
    document.getElementById("updatedTxt").textContent = "Updated " + relTime(meta.lastUpdated);
  }

  // New banner — only show IDs not yet acknowledged
  const ackd = JSON.parse(localStorage.getItem("appr_ackedNew") || "[]");
  const freshNew = asArr(meta.newSinceLastScrape).filter(id => !ackd.includes(id));
  const nb = document.getElementById("newBanner");
  if(freshNew.length){
    nb.classList.add("show");
    document.getElementById("newBannerTxt").textContent = freshNew.length + " new listing" + (freshNew.length>1?"s":"") + " since your last visit";
  } else { nb.classList.remove("show"); }

  // Stats
  let open=0, closingSoon=0, applied=0, watching=0;
  data.companies.forEach(c => c.programs.forEach(p => {
    const s = liveStatus(p);
    if(s === "open") open++;
    if(s === "closing_soon"){ closingSoon++; open++; }
    const u = getUser(p.id);
    if(u.userStatus === "applied") applied++;
    if(u.userStatus === "watching") watching++;
  }));

  // Next predicted opening across companies
  let nextP = null;
  data.companies.forEach(c => {
    const pr = predictOpen(c);
    if(pr && pr.days >= 0 && (!nextP || pr.days < nextP.days)) nextP = { name:c.name, days:pr.days };
  });

  const summary = document.getElementById("summary");
  summary.innerHTML = "";
  summary.appendChild(statEl("open", open, "Open now"));
  summary.appendChild(statEl("closing_soon", closingSoon, "Closing ≤14 days"));
  summary.appendChild(statEl("applied", applied, "Applied"));
  summary.appendChild(statEl("watching", watching, "Watching"));
  const pEl = document.createElement("div");
  pEl.className = "stat predict";
  pEl.innerHTML = nextP
    ? `<div class="n" style="font-size:18px">${nextP.name}</div><div class="l">Next predicted opening · ~${nextP.days} days</div>`
    : `<div class="n" style="font-size:18px">—</div><div class="l">Next predicted opening</div>`;
  summary.appendChild(pEl);

  // Grid
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  data.companies.forEach(c => {
    if(activeSector !== "all" && c.sector !== activeSector) return;

    // Filter programs by active stat + closing window
    const progs = c.programs.filter(p => {
      const s = liveStatus(p);
      const u = getUser(p.id);
      if(activeStatFilter === "open" && !(s==="open"||s==="closing_soon")) return false;
      if(activeStatFilter === "closing_soon" && s!=="closing_soon") return false;
      if(activeStatFilter === "applied" && u.userStatus!=="applied") return false;
      if(activeStatFilter === "watching" && u.userStatus!=="watching") return false;
      if(closingWithin !== "any"){
        const d = daysUntil(p.closingDate);
        if(d === null || d > +closingWithin || d < 0) return false;
      }
      return true;
    });
    if(!progs.length) return;

    const card = document.createElement("div");
    card.className = "card";
    const pr = predictOpen(c);
    card.innerHTML = `
      <div class="card-head">
        <div class="left"><span class="dot" style="background:${c.color}"></span><h3>${c.name}</h3></div>
        <span class="tag">${c.sector}</span>
      </div>
      ${pr ? `<div class="predict-line">Typically opens ~${MN[pr.month]}${pr.days>=0?` · in ~${pr.days} days`:""}</div>`:""}
      <div class="links">
        <a href="${c.govSearchUrl}" target="_blank">Gov ↗</a>
        <a href="https://www.ucas.com/explore/search/courses-beta?query=${encodeURIComponent(c.name)}" target="_blank">UCAS ↗</a>
        <a href="https://higherin.com/search-jobs/degree-apprenticeship" target="_blank">Higherin ↗</a>
        <a href="${c.careerUrl}" target="_blank">Careers ↗</a>
      </div>
    `;
    progs.forEach(p => card.appendChild(programEl(p)));
    grid.appendChild(card);
  });
  if(!grid.children.length){
    grid.innerHTML = `<div style="color:var(--muted);padding:40px;text-align:center;grid-column:1/-1">No programs match these filters.</div>`;
  }

  renderTimeline();
  renderInterest();
  renderCharts();
}

function barRow(label, value, max, color, animCls){
  const pct = max > 0 ? Math.round(value / max * 100) : 0;
  return `<div class="bar-row"><span class="blab">${label}</span><span class="bar-track"><span class="bar-fill${animCls}" style="width:${pct}%;background:${color}"></span></span><span class="bval">${value}</span></div>`;
}

function renderCharts(){
  const data = window.TRACKER_DATA;
  const st = { open:0, closing_soon:0, not_open:0, closed:0 };
  const fn = { watching:0, applied:0, interview:0, offer:0, rejected:0 };
  data.companies.forEach(c => c.programs.forEach(p => {
    const s = liveStatus(p); if(st[s] !== undefined) st[s]++;
    const u = getUser(p.id); if(fn[u.userStatus] !== undefined) fn[u.userStatus]++;
  }));
  const stMax = Math.max(1, st.open, st.closing_soon, st.not_open, st.closed);
  const fnMax = Math.max(1, fn.watching, fn.applied, fn.interview, fn.offer, fn.rejected);
  const anim = chartsAnimated ? "" : " fill-in";   // draw-in runs on the first paint only
  document.getElementById("statusChart").innerHTML =
    barRow("Open", st.open, stMax, "var(--green)", anim) +
    barRow("Closing soon", st.closing_soon, stMax, "var(--amber)", anim) +
    barRow("Not yet open", st.not_open, stMax, "var(--grey)", anim) +
    barRow("Closed", st.closed, stMax, "var(--red)", anim);
  document.getElementById("funnelChart").innerHTML =
    barRow("Watching", fn.watching, fnMax, "var(--muted)", anim) +
    barRow("Applied", fn.applied, fnMax, "var(--accent)", anim) +
    barRow("Interview", fn.interview, fnMax, "var(--gold)", anim) +
    barRow("Offer", fn.offer, fnMax, "var(--green)", anim) +
    barRow("Rejected", fn.rejected, fnMax, "var(--red)", anim);
  chartsAnimated = true;
}

function renderInterest(){
  const list = document.getElementById("interestList");
  const items = asArr(window.TRACKER_DATA.interestListings).slice();
  // Sort: soonest closing date first, undated last
  items.sort((a,b)=>{
    const da = a.closingDate ? +new Date(a.closingDate) : Number.MAX_SAFE_INTEGER;
    const db = b.closingDate ? +new Date(b.closingDate) : Number.MAX_SAFE_INTEGER;
    return da - db;
  });
  if(!items.length){
    list.innerHTML = `<div class="interest-empty">Nothing extra right now — the next scheduled check (9am, 1pm or 4pm) will add any new sales, consulting, tech or business Level 6 apprenticeships it spots at large companies.</div>`;
    return;
  }
  list.innerHTML = "";
  items.forEach(it => {
    const d = daysUntil(it.closingDate);
    const row = document.createElement("div");
    row.className = "irow";
    row.innerHTML = `
      <div class="imain">
        <div class="ititle">${it.company ? it.company + " — " : ""}${it.title || "Apprenticeship"}</div>
        <div class="imeta">${[it.standard || "Level 6", it.location, it.salary].filter(Boolean).join(" · ")}</div>
      </div>
      ${it.category ? `<span class="icat">${it.category}</span>` : ""}
      ${it.closingDate ? `<span class="iclose">${d!==null&&d>=0?d+"d left":"closed"}</span>` : ""}
      ${it.applyUrl ? `<a class="iapply" href="${it.applyUrl}" target="_blank">View ↗</a>` : ""}
    `;
    list.appendChild(row);
  });
}

function statEl(key, n, label){
  const el = document.createElement("div");
  el.className = "stat" + (activeStatFilter===key ? " active":"");
  el.innerHTML = `<div class="n">${n}</div><div class="l">${label}</div>`;
  // Keyboard-operable filter: expose as a toggle button to assistive tech.
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-pressed", activeStatFilter===key ? "true" : "false");
  el.setAttribute("aria-label", `Filter by ${label}: ${n}`);
  const toggle = () => { activeStatFilter = activeStatFilter===key ? null : key; render(); };
  el.onclick = toggle;
  el.onkeydown = (e) => { if(e.key==="Enter" || e.key===" "){ e.preventDefault(); toggle(); } };
  return el;
}

function programEl(p){
  const s = liveStatus(p);
  const u = getUser(p.id);
  const d = daysUntil(p.closingDate);
  const el = document.createElement("div");
  el.className = "program";
  el.innerHTML = `
    <div class="ptop">
      <div>
        <div class="pname">${p.name}</div>
        <div class="pmeta">${[p.standard, p.location, p.salary, p.duration].filter(Boolean).join(" · ")}</div>
      </div>
      <span class="badge ${s}">${BADGE_TXT[s]}</span>
    </div>
    ${p.closingDate ? `<div class="closing">Closes ${fmtDate(p.closingDate)}${d!==null&&d>=0?` · ${d} day${d!==1?"s":""} left`:""}</div>`:""}
    ${p.applyUrl ? `<div style="margin-top:6px"><a href="${p.applyUrl}" target="_blank">Apply / view listing ↗</a></div>`:""}
  `;
  const track = document.createElement("div");
  track.className = "track";
  const sel = document.createElement("select");
  STATUS_OPTS.forEach(o => { const op=document.createElement("option"); op.value=o; op.textContent=STATUS_LABEL[o]; if(o===u.userStatus) op.selected=true; sel.appendChild(op); });
  sel.onchange = () => { const nu=getUser(p.id); nu.userStatus=sel.value; if(sel.value==="applied"&&!nu.userAppliedDate) nu.userAppliedDate=todayISO(); setUser(p.id,nu); render(); };
  track.appendChild(sel);

  const ab = document.createElement("button");
  ab.className = "applybtn"; ab.textContent = "Mark applied today";
  ab.onclick = () => { const nu=getUser(p.id); nu.userStatus="applied"; nu.userAppliedDate=todayISO(); setUser(p.id,nu); render(); };
  track.appendChild(ab);

  if(u.userStatus==="applied" && u.userAppliedDate){
    const ad = document.createElement("span");
    ad.className = "applied-date"; ad.textContent = "Applied " + fmtDate(u.userAppliedDate);
    track.appendChild(ad);
  }
  el.appendChild(track);

  const notes = document.createElement("textarea");
  notes.className = "notes"; notes.placeholder = "Notes…"; notes.maxLength = 500; notes.value = u.userNotes || "";
  notes.onblur = () => { const nu=getUser(p.id); nu.userNotes=notes.value; setUser(p.id,nu); };
  el.appendChild(notes);
  return el;
}

function renderTimeline(){
  const tl = document.getElementById("timeline");
  tl.innerHTML = `<div class="tl-name"></div>` + MONTHS.map(m=>`<div class="tl-month">${m}</div>`).join("");
  window.TRACKER_DATA.companies.forEach(c => {
    if(activeSector!=="all" && c.sector!==activeSector) return;
    if(!c.historicalCycles || !c.historicalCycles.length) return;
    const openM = Math.round(c.historicalCycles.reduce((s,x)=>s+x.openedMonth,0)/c.historicalCycles.length);
    const closeM = Math.round(c.historicalCycles.reduce((s,x)=>s+x.closedMonth,0)/c.historicalCycles.length);
    const oi = MONTH_NUM.indexOf(openM), ci = MONTH_NUM.indexOf(closeM);
    if(oi<0) return;
    const span = (ci<0?oi:ci) - oi + 1;
    const name = document.createElement("div"); name.className="tl-name"; name.textContent=c.name;
    const row = document.createElement("div"); row.className="tl-row";
    const bar = document.createElement("div"); bar.className="tl-bar";
    bar.style.background = c.color;
    bar.style.left = (oi/7*100) + "%";
    bar.style.width = (Math.max(span,1)/7*100) + "%";
    bar.title = `${c.name}: ~${MN[openM]} – ${MN[closeM]}`;
    row.appendChild(bar);
    tl.appendChild(name); tl.appendChild(row);
  });
}

function relTime(iso){
  const s = (new Date()-new Date(iso))/1000;
  if(s<60) return "just now";
  if(s<3600) return Math.floor(s/60)+" min ago";
  if(s<86400) return Math.floor(s/3600)+" h ago";
  const d = Math.floor(s/86400);
  return d + (d===1 ? " day ago" : " days ago");
}

function dismissNew(){
  const meta = window.TRACKER_DATA.meta;
  localStorage.setItem("appr_ackedNew", JSON.stringify(meta.newSinceLastScrape||[]));
  render();
}

// Filter wiring — the sector switcher only exists on a combined page; single-sector
// pages (sales/finance/consulting) omit it and just show every company in their file.
const sectorSeg = document.getElementById("sectorSeg");
if(sectorSeg){
  sectorSeg.addEventListener("click", e => {
    if(e.target.tagName!=="BUTTON") return;
    document.querySelectorAll("#sectorSeg button").forEach(b=>b.classList.remove("active"));
    e.target.classList.add("active"); activeSector = e.target.dataset.v; render();
  });
}
const closingFilter = document.getElementById("closingFilter");
if(closingFilter){
  closingFilter.addEventListener("change", e => { closingWithin = e.target.value; render(); });
}

// Skeleton placeholders shown while data.json is fetching
function renderSkeletons(n){
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  for(let i=0; i<(n||6); i++){
    const c = document.createElement("div");
    c.className = "skel-card";
    c.innerHTML = '<div class="skel-line title"></div><div class="skel-line w85"></div><div class="skel-line w65"></div><div class="skel-line w40"></div><div class="skel-pill"></div>';
    grid.appendChild(c);
  }
}

// Load the page's data and render. Re-fetch on focus.
// A single-sector page sets window.DATA_FILE (e.g. "data-finance.json").
// The combined showcase page sets window.DATA_FILES (an array) and they're merged.
const DATA_FILE  = window.DATA_FILE || "data.json";
const DATA_FILES = Array.isArray(window.DATA_FILES) && window.DATA_FILES.length ? window.DATA_FILES : null;

function mergeDatasets(sets){
  const merged = { meta: { lastUpdated: null, newSinceLastScrape: [] }, interestListings: [], companies: [] };
  sets.forEach(d => {
    merged.companies = merged.companies.concat(asArr(d.companies));
    merged.interestListings = merged.interestListings.concat(asArr(d.interestListings));
    const lu = d.meta && d.meta.lastUpdated;
    if(lu && (!merged.meta.lastUpdated || new Date(lu) > new Date(merged.meta.lastUpdated))) merged.meta.lastUpdated = lu;
    const af = d.meta && d.meta.activeFrom;
    if(af && (!merged.meta.activeFrom || new Date(af) < new Date(merged.meta.activeFrom))) merged.meta.activeFrom = af;
    merged.meta.newSinceLastScrape = merged.meta.newSinceLastScrape.concat(asArr(d.meta && d.meta.newSinceLastScrape));
  });
  return merged;
}

let dataLoadedOnce = false;
async function loadData(){
  if(!dataLoadedOnce) renderSkeletons(6);   // only show skeletons on the first load, not on focus refreshes
  try {
    if(DATA_FILES){
      const sets = await Promise.all(DATA_FILES.map(f =>
        fetch(f + "?t=" + Date.now(), { cache: "no-store" }).then(r => r.json())));
      window.TRACKER_DATA = mergeDatasets(sets);
    } else {
      const r = await fetch(DATA_FILE + "?t=" + Date.now(), { cache: "no-store" });
      window.TRACKER_DATA = await r.json();
    }
    dataLoadedOnce = true;
    render();
  } catch(e){
    document.getElementById("grid").innerHTML =
      '<div style="color:var(--muted);padding:40px;text-align:center;grid-column:1/-1">Couldn’t load the tracker data. If viewing locally, open via a web server rather than the file directly.</div>';
  }
}
document.addEventListener("visibilitychange", () => { if(!document.hidden) loadData(); });
setInterval(loadData, 5 * 60 * 1000);   // auto-refresh every 5 minutes while the tab stays open

loadData();
