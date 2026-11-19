(() => {
  "use strict";
  const DATA = window.LISP_DATA;
  const ITEMS = DATA.items;
  const NO_DL = new Set(["系統/授權"]);
  const PAGE = 60;

  const EMOJI = {
    "圖塊/屬性": "🧱", "繪圖": "✏️", "標註": "📏", "面積/數量統計": "📐", "修改": "🔧",
    "文字": "🔤", "圖層": "🗂️", "系統/授權": "🔐", "圖面管理": "🗺️", "剖面/結構": "🏗️",
    "出圖/列印": "🖨️", "轉檔/匯出入": "🔄", "對齊/排列": "🧭", "查詢": "🔎", "其他": "📦", "3D": "🧊",
  };
  // 島嶼位置（依支數由多到少排列後套用）
  const SLOTS = [
    [300, 240], [1300, 240], [800, 560], [300, 830], [1300, 840], [800, 200], [1030, 390], [560, 410],
    [550, 720], [1060, 730], [1480, 540], [120, 540], [800, 920], [1050, 100], [550, 100], [1060, 1010],
    [130, 1000], [1480, 1000], [130, 90], [1480, 90],
  ];
  const LAND = ["#6dbb63", "#79c46a", "#5fae5f", "#82c26b", "#68b870", "#74bd5c"];

  const $ = (s) => document.querySelector(s);
  const svg = $("#map"), gIslands = $("#islands"), panel = $("#panel"), cardsEl = $("#cards");
  const qEl = $("#q"), moreBtn = $("#more");
  const fLevel = $("#fLevel"), fLt = $("#fLt"), fSort = $("#fSort"), fFas = $("#fFas");

  const state = { cat: "", q: "", shown: PAGE, list: [] };

  // ---------- 分類 ----------
  const cats = {};
  for (const it of ITEMS) (cats[it.cat || "其他"] ||= []).push(it);
  const catList = Object.keys(cats).map((name) => ({ name, items: cats[name] }))
    .sort((a, b) => b.items.length - a.items.length);
  catList.forEach((c, i) => {
    const [x, y] = SLOTS[i] || [100 + (i % 8) * 190, 1080];
    c.x = x; c.y = y; c.r = 30 + Math.sqrt(c.items.length) * 6; c.seed = i * 7.31 + 1.7;
  });

  const nFas = ITEMS.filter((i) => i.fas).length;
  $("#stats").textContent = `${ITEMS.length.toLocaleString()} 支指令 · ${catList.length} 個分類 · ${nFas.toLocaleString()} 個 .fas 可下載`;
  $("#catCount").textContent = catList.length;

  // ---------- 工具 ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const terms = () => state.q.toLowerCase().split(/\s+/).filter(Boolean);
  function hl(text) {
    let s = esc(text);
    const t = terms();
    if (!t.length) return s;
    const re = new RegExp("(" + t.map((x) => esc(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
    return s.replace(re, "<mark>$1</mark>");
  }
  const hay = (it) => (it._h ||= [it.cmd, it.file, it.desc, it.usage, it.author, it.cat].join(" ").toLowerCase());
  const matches = (it, t) => t.every((x) => hay(it).includes(x));
  const lvlStars = (n) => {
    n = Number(n) || 0;
    return `<span class="lvl" title="難易度 ${n}/9">${"●".repeat(n)}<i>${"●".repeat(Math.max(0, 9 - n))}</i></span>`;
  };
  const safeUrl = (u) => /^https?:\/\//i.test(u || "") ? u : "";
  const fasHref = (p) => p.split("/").map(encodeURIComponent).join("/");

  // ---------- 島嶼繪製 ----------
  function rand(seed) { const x = Math.sin(seed) * 43758.5453; return x - Math.floor(x); }
  function blob(cx, cy, r, seed, wobble = 0.13, n = 14) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + wobble * (Math.sin(a * 2 + seed) * 0.6 + Math.sin(a * 3 + seed * 1.7) * 0.4 + (rand(seed + i) - 0.5) * 0.8);
      pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * 0.82]);
    }
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d + "Z";
  }
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  function drawIslands() {
    catList.forEach((c, i) => {
      const g = el("g", { class: "island", tabindex: 0, role: "button", "aria-label": `${c.name}，${c.items.length} 支指令` }, gIslands);
      c.g = g;
      el("path", { d: blob(c.x, c.y + 6, c.r * 1.22, c.seed, 0.1), fill: "#5cc3d6", opacity: 0.35 }, g);
      const body = el("g", { class: "body", filter: "url(#shadow)" }, g);
      el("path", { class: "shore", d: blob(c.x, c.y, c.r, c.seed), fill: "#f1dca2", stroke: "#fff3cf", "stroke-width": 2 }, body);
      el("path", { d: blob(c.x, c.y - c.r * 0.04, c.r * 0.84, c.seed + 0.5), fill: LAND[i % LAND.length] }, body);
      el("path", { d: blob(c.x - c.r * 0.12, c.y - c.r * 0.14, c.r * 0.45, c.seed + 2.2, 0.2, 10), fill: "#4c9a49", opacity: 0.75 }, body);
      // 小樹點綴
      const trees = Math.min(9, 2 + Math.round(c.items.length / 40));
      for (let t = 0; t < trees; t++) {
        const a = rand(c.seed + t * 3.1) * Math.PI * 2, rr = c.r * (0.45 + rand(c.seed + t) * 0.28);
        el("circle", { cx: c.x + Math.cos(a) * rr, cy: c.y + Math.sin(a) * rr * 0.75, r: 4 + rand(t + c.seed) * 4, fill: "#2f7a3a", opacity: 0.8 }, body);
      }
      const emo = el("text", { class: "emoji", x: c.x, y: c.y - c.r * 0.12, "font-size": c.r * 0.42 }, body);
      emo.textContent = EMOJI[c.name] || "🏝️";
      const lab = el("text", { class: "label", x: c.x, y: c.y + c.r * 0.3, "font-size": Math.max(19, c.r * 0.21) }, body);
      lab.textContent = c.name;
      const cnt = el("text", { class: "count", x: c.x, y: c.y + c.r * 0.3 + Math.max(19, c.r * 0.21) }, body);
      cnt.textContent = `${c.items.length} 支`;
      c.badge = el("g", { class: "badge-hit", visibility: "hidden" }, g);
      el("circle", { cx: c.x + c.r * 0.78, cy: c.y - c.r * 0.62, r: 20 }, c.badge);
      c.badgeText = el("text", { x: c.x + c.r * 0.78, y: c.y - c.r * 0.62 }, c.badge);

      const go = () => openCat(c.name);
      g.addEventListener("click", go);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  // ---------- 鏡頭 ----------
  let vb = [0, 0, 1600, 1100], anim = 0;
  const isMobile = () => window.innerWidth <= 760;
  function targetView() {
    const W = svg.clientWidth || 1, H = svg.clientHeight || 1;
    const c = catList.find((x) => x.name === state.cat);
    const panelOpen = panel.classList.contains("open");
    let availW = W, availH = H;
    if (panelOpen) { if (isMobile()) availH = H * 0.28; else availW = Math.max(200, W - panel.offsetWidth); }
    let k, cx, cy;
    if (c) { k = (c.r * 2.9) / Math.min(availW, availH); cx = c.x; cy = c.y; }
    else { k = Math.max(1640 / availW, 1140 / availH); cx = 800; cy = 550; }
    return [cx - (availW / 2) * k, cy - (availH / 2) * k, W * k, H * k];
  }
  // 3D 地圖（map3d.js 載入成功後透過 LispApp.use3D 掛上）
  let view3d = null;
  function panelInset() {
    if (!panel.classList.contains("open")) return { right: 0, bottom: 0 };
    return isMobile() ? { right: 0, bottom: panel.offsetHeight } : { right: panel.offsetWidth, bottom: 0 };
  }
  function moveCamera(instant) {
    if (view3d) { view3d.focus(state.cat, panelInset(), instant); return; }
    const to = targetView(), from = vb.slice(), t0 = performance.now(), dur = instant ? 0 : 650;
    cancelAnimationFrame(anim);
    const step = (now) => {
      const p = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      vb = from.map((v, i) => v + (to[i] - v) * e);
      svg.setAttribute("viewBox", vb.map((v) => v.toFixed(2)).join(" "));
      if (p < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  // ---------- 清單 ----------
  function filtered() {
    const t = terms();
    let list = state.cat ? cats[state.cat] : ITEMS;
    if (t.length) list = list.filter((it) => matches(it, t));
    if (fLevel.value) { const [a, b] = fLevel.value.split("-").map(Number); list = list.filter((it) => it.level >= a && it.level <= b); }
    if (fLt.value) list = list.filter((it) => it.lt === fLt.value);
    if (fFas.checked) list = list.filter((it) => it.fas);
    const s = fSort.value;
    return list.slice().sort((a, b) =>
      s === "cmd" ? String(a.cmd).localeCompare(String(b.cmd), "zh-Hant") :
      s === "level" ? (b.level - a.level) || (a.no - b.no) : a.no - b.no);
  }

  function render() {
    const t = terms();
    // 地圖上的搜尋標記
    catList.forEach((c) => {
      const hits = t.length ? c.items.filter((it) => matches(it, t)).length : 0;
      c.hits = hits;
      c.dim = (t.length && !hits) || (!!state.cat && state.cat !== c.name);
      c.badge.setAttribute("visibility", t.length && hits ? "visible" : "hidden");
      c.badgeText.textContent = hits;
      c.g.classList.toggle("dim", c.dim);
      c.g.classList.toggle("active", state.cat === c.name);
    });
    if (view3d) view3d.update({ active: state.cat, searching: t.length > 0 });
    $("#hint").style.opacity = state.cat || t.length ? 0 : 1;

    const open = !!(state.cat || t.length);
    const wasOpen = panel.classList.contains("open");
    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", String(!open));
    if (!open) return;

    state.list = filtered();
    const title = state.cat ? `${EMOJI[state.cat] || "🏝️"} ${state.cat}島` : "🔍 全島搜尋";
    $("#panelTitle").textContent = title;
    const total = state.cat ? cats[state.cat].length : ITEMS.length;
    let sub = `${state.list.length} / ${total} 支指令`;
    if (state.q) sub += ` · 關鍵字「${state.q}」`;
    if (state.cat && NO_DL.has(state.cat)) sub += " · 本分類不提供下載";
    $("#panelSub").textContent = sub;

    const html = state.list.slice(0, state.shown).map((it) => `
      <li class="card" data-no="${esc(it.no)}" tabindex="0">
        <div class="row"><h3>${hl(it.cmd || it.file)}</h3><span class="meta">${lvlStars(it.level)} ${esc(it.lt)}</span></div>
        <p>${hl(it.desc)}</p>
        <div class="tags">
          ${state.cat ? "" : `<span class="tag cat">${esc(it.cat)}</span>`}
          <span class="tag">${hl(it.file)}</span>
          ${it.fas ? '<span class="tag dl">⬇ .fas</span>' : ""}
          ${safeUrl(it.video) ? '<span class="tag vid">▶ 影片</span>' : ""}
        </div>
      </li>`).join("");
    cardsEl.innerHTML = html || '<li class="empty">找不到符合的指令 🌊</li>';
    moreBtn.hidden = state.list.length <= state.shown;
    moreBtn.textContent = `顯示更多（還有 ${state.list.length - state.shown} 支）`;
    if (wasOpen !== open) requestAnimationFrame(() => moveCamera());
  }

  function openCat(name) {
    state.cat = state.cat === name ? "" : name;
    state.shown = PAGE;
    cardsEl.scrollTop = 0;
    render(); moveCamera(); syncHash();
  }
  function goHome() {
    state.cat = ""; state.q = ""; qEl.value = ""; state.shown = PAGE;
    render(); moveCamera(); syncHash();
  }

  // ---------- 詳細資訊 ----------
  const crit = {};
  for (const c of DATA.criteria) crit[c.item + "|" + c.level] = c.text;

  function showDetail(no) {
    const it = ITEMS.find((x) => String(x.no) === String(no));
    if (!it) return;
    const lvText = crit["程式難易度|" + it.level] || "";
    const ltText = crit["LT 2024+|" + it.lt] || "";
    const video = safeUrl(it.video);
    const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : "";
    let dlBtn;
    if (it.fas) dlBtn = `<a class="btn primary" href="${esc(fasHref(it.fas))}" download>⬇ 下載 ${esc(it.fas.split("/").pop())}</a>`;
    else if (NO_DL.has(it.cat)) dlBtn = `<span class="btn off">🔒 本分類不提供下載</span>`;
    else dlBtn = `<span class="btn off">尚無 .fas 檔</span>`;
    $("#detailBody").innerHTML = `
      <h2>${esc(it.cmd || it.file)}</h2>
      <span class="tag cat">${EMOJI[it.cat] || ""} ${esc(it.cat)}</span>
      <dl class="dl-grid">
        ${row("序號", esc(it.no))}
        ${row("檔名", esc(it.file))}
        ${row("功能說明", esc(it.desc))}
        ${row("操作方式", esc(it.usage))}
        ${row("程式難易度", `${lvlStars(it.level)} ${esc(it.level)}/9${lvText ? `<br><small>${esc(lvText)}</small>` : ""}`)}
        ${row("支援 LT 2024+", `${esc(it.lt)}${ltText ? ` <small>${esc(ltText)}</small>` : ""}`)}
        ${row("版本/日期", esc(it.ver))}
        ${row("作者/來源", esc(it.author))}
      </dl>
      <div class="actions">
        ${dlBtn}
        ${video ? `<a class="btn video" href="${esc(video)}" target="_blank" rel="noopener">▶ 觀看教學影片</a>` : `<span class="btn off">▶ 教學影片（準備中）</span>`}
      </div>`;
    const d = $("#detail");
    if (!d.open) d.showModal();
    syncHash(it.no);
  }

  function showLegend() {
    const rows = DATA.criteria.map((c) => `<tr><th>${esc(c.item)}</th><td>${esc(c.level)}</td><td>${esc(c.text)}</td></tr>`).join("");
    $("#legendBody").innerHTML = `<table class="legend-table">${rows}</table>`;
    $("#legend").showModal();
  }

  // ---------- 網址 ----------
  function syncHash(no) {
    const p = new URLSearchParams();
    if (state.cat) p.set("cat", state.cat);
    if (state.q) p.set("q", state.q);
    if (no) p.set("id", no);
    const h = p.toString();
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    state.cat = cats[p.get("cat")] ? p.get("cat") : "";
    state.q = p.get("q") || "";
    qEl.value = state.q;
    return p.get("id");
  }

  // ---------- 事件 ----------
  let qTimer;
  qEl.addEventListener("input", () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      const hadCat = !!state.cat;
      state.q = qEl.value.trim(); state.cat = ""; state.shown = PAGE; cardsEl.scrollTop = 0;
      render(); if (hadCat) moveCamera(); syncHash();
    }, 140);
  });
  [fLevel, fLt, fSort, fFas].forEach((f) => f.addEventListener("change", () => { state.shown = PAGE; render(); }));
  moreBtn.addEventListener("click", () => { state.shown += PAGE; render(); });
  cardsEl.addEventListener("click", (e) => { const c = e.target.closest(".card"); if (c) showDetail(c.dataset.no); });
  cardsEl.addEventListener("keydown", (e) => { const c = e.target.closest(".card"); if (c && e.key === "Enter") showDetail(c.dataset.no); });
  $("#closePanel").addEventListener("click", goHome);
  $("#homeBtn").addEventListener("click", goHome);
  $("#homeBtn").addEventListener("keydown", (e) => { if (e.key === "Enter") goHome(); });
  $("#legendBtn").addEventListener("click", showLegend);
  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
    d.addEventListener("close", () => { if (d.id === "detail") syncHash(); });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== qEl && !document.querySelector("dialog[open]")) { e.preventDefault(); qEl.focus(); }
    if (e.key === "Escape" && !document.querySelector("dialog[open]") && panel.classList.contains("open")) goHome();
  });
  window.addEventListener("resize", () => { if (view3d) view3d.resize(panelInset()); else moveCamera(true); });

  window.LispApp = {
    catList, emoji: EMOJI, openCat,
    get state() { return state; },
    use3D(v) {
      view3d = v;
      svg.style.display = v ? "none" : "";
      $("#hint").innerHTML = v
        ? `點選島嶼進入分類 · 拖曳旋轉、滾輪縮放 · 共 <b>${catList.length}</b> 座島`
        : `點選島嶼進入分類 · 共 <b>${catList.length}</b> 座島`;
      render(); moveCamera(true);
    },
  };

  // ---------- 啟動 ----------
  drawIslands();
  const id = readHash();
  render();
  moveCamera(true);
  if (id) showDetail(id);
})();
