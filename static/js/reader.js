import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const STORAGE_KEY = "lhid-last-page";

const body = document.body;
const viewerId = body.dataset.viewer || "guest";
const token = body.dataset.token || "";
const pageInd = document.getElementById("page-ind");
const pageJump = document.getElementById("page-jump");
const wm = document.getElementById("wm");
const shield = document.getElementById("shield");
const shell = document.getElementById("book-shell");
const side = document.getElementById("side");
const nowPageEl = document.getElementById("now-page");
const lastPageEl = document.getElementById("last-page");
const progressLabel = document.getElementById("progress-label");
const progressBar = document.getElementById("progress-bar");
const indexList = document.getElementById("index-list");

let pdf = null;
let flip = null;
let zoom = 1;
let currentPdfPage = 1;
const painted = new Set();
const paintLock = new Map();

function inSidePanel(el) {
  return !!(el && (el.closest?.(".side-panel") || el.closest?.(".reader-bar")));
}

function hardBlock(e) {
  if (inSidePanel(e.target)) return;
  const tag = (e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "button") return;
  e.preventDefault();
  e.stopPropagation();
  return false;
}

["copy", "cut", "paste", "dragstart", "selectstart", "contextmenu"].forEach((ev) => {
  document.addEventListener(ev, hardBlock, true);
});

function showShield(on) {
  shield.hidden = !on;
  shell.style.filter = on ? "blur(16px)" : "";
  if (!on) document.body.style.filter = "";
}

document.addEventListener("visibilitychange", () => showShield(document.hidden));
window.addEventListener("focus", () => showShield(false));
document.addEventListener("click", () => {
  if (!document.hidden) showShield(false);
});

function fillWatermark() {
  wm.innerHTML = "";
  const stamp = `${viewerId} · Life Happens in Decisions · ${new Date().toISOString().slice(0, 16)}Z`;
  for (let i = 0; i < 18; i++) {
    const s = document.createElement("span");
    s.textContent = stamp;
    s.style.left = `${(i % 3) * 36 - 8}%`;
    s.style.top = `${Math.floor(i / 3) * 18 + 6}%`;
    wm.appendChild(s);
  }
}

function isMobileLayout() {
  return window.innerWidth <= 980;
}

function sideWidth() {
  return isMobileLayout() ? 16 : 300;
}

function bookMetrics() {
  const pageRatio = 648 / 432;
  const mobile = isMobileLayout();
  const availW = Math.max(200, window.innerWidth - sideWidth());
  const availH = Math.max(260, window.innerHeight - (mobile ? 110 : 140));
  // Phones: always one page at a time (portrait flip)
  const landscape = !mobile && availW >= 720;
  const maxPageW = landscape ? availW / 2 : availW * (mobile ? 0.96 : 1);
  const maxPageH = availH;
  let w = Math.floor(Math.min(maxPageW, maxPageH / pageRatio));
  w = Math.max(mobile ? 180 : 220, Math.min(w, mobile ? 420 : 640));
  const h = Math.floor(w * pageRatio);
  return { w, h, landscape, spreadW: landscape ? w * 2 : w, mobile };
}

async function paint(n) {
  if (!pdf || n < 1 || n > pdf.numPages) return;
  if (paintLock.has(n)) return paintLock.get(n);
  const job = (async () => {
    const canvases = document.querySelectorAll(`[data-page="${n}"] canvas`);
    if (!canvases.length) return;
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = bookMetrics().w;
    const targetW = Math.max(cssW * dpr, 400);
    const viewport = page.getViewport({ scale: targetW / base.width });
    const w = Math.floor(viewport.width);
    const h = Math.floor(viewport.height);
    for (const canvas of canvases) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#f4ead8";
      ctx.fillRect(0, 0, w, h);
      await page.render({ canvasContext: ctx, viewport }).promise;
      canvas.dataset.ready = String(n);
    }
    painted.add(n);
  })().finally(() => paintLock.delete(n));
  paintLock.set(n, job);
  return job;
}

async function paintAround(flipIndex) {
  const pdfCenter = flipToPdfPage(flipIndex);
  const order = [0, 1, -1, 2, 3, -2, 4, -3, 5, -4].map((d) => pdfCenter + d);
  await Promise.all(order.map((n) => paint(n)));
  for (const n of [...painted]) {
    if (Math.abs(n - pdfCenter) > 8) {
      document.querySelectorAll(`[data-page="${n}"] canvas`).forEach((c) => {
        c.width = 1;
        c.height = 1;
        delete c.dataset.ready;
      });
      painted.delete(n);
    }
  }
}

function flipToPdfPage(idx) {
  if (idx <= 0) return 1;
  if (idx === 1) return 1;
  return Math.min(pdf.numPages, idx);
}

function pdfToFlipIndex(pdfPage) {
  const n = Math.max(1, Math.min(pdf.numPages, pdfPage | 0));
  if (n <= 1) return 0;
  return n;
}

function readLastStored() {
  const n = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function saveLast(page) {
  try {
    localStorage.setItem(STORAGE_KEY, String(page));
  } catch (_) {}
}

function updateSide(pdfPage) {
  currentPdfPage = pdfPage;
  const total = pdf?.numPages || 187;
  const pct = Math.round((pdfPage / total) * 100);
  nowPageEl.textContent = `${pdfPage} / ${total}`;
  const last = readLastStored();
  lastPageEl.textContent = last ? String(last) : "—";
  progressLabel.textContent = `${pct}%`;
  progressBar.style.width = `${pct}%`;
  pageJump.value = String(pdfPage);
  pageJump.max = String(total);
  indexList.querySelectorAll("button").forEach((btn) => {
    const p = parseInt(btn.dataset.page, 10);
    btn.classList.toggle("active", p === pdfPage);
  });
}

function markPages() {
  if (!pdf) return;
  const idx = flip ? flip.getCurrentPageIndex() : 0;
  const pdfPage = flipToPdfPage(idx);
  pageInd.textContent = `${pdfPage} / ${pdf.numPages}`;
  saveLast(pdfPage);
  updateSide(pdfPage);
}

function buildIndex() {
  const total = pdf.numPages;
  // PDF order: 1=C1 cover, 2-11=cover1-10, 12-183=page1-172, 184=C2
  const entries = [
    { label: "Cover", page: 1 },
    { label: "Title", page: 2 },
    { label: "Map of the book", page: 11 },
    { label: "Introduction", page: 12 }, // page1
    { label: "Weight I — Time", page: 22 }, // page11
    { label: "Weight II — Comfort", page: 38 },
    { label: "Weight III — Risk", page: 54 },
    { label: "Weight IV — Obligations", page: 70 },
    { label: "Weight V — Identity", page: 86 },
    { label: "Weight VI — Relationships", page: 102 },
    { label: "Weight VII — Opportunity", page: 118 },
    { label: "Weight VIII — Attention", page: 134 },
    { label: "Weight IX — Resilience", page: 150 },
    { label: "Weight X — Legacy", page: 166 },
    { label: "About the author", page: 183 },
    { label: "Back cover", page: total },
  ];
  indexList.innerHTML = "";
  for (const e of entries) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.page = String(e.page);
    btn.innerHTML = `<em style="font-style:normal">${e.label}</em><span>${e.page}</span>`;
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      goTo(e.page);
      if (isMobileLayout()) setSideOpen(false);
    });
    indexList.appendChild(btn);
  }
}

function ensureBook() {
  let el = document.getElementById("book");
  if (!el || !el.isConnected) {
    el = document.createElement("div");
    el.id = "book";
    shell.insertBefore(el, wm);
  }
  return el;
}

function makeLeaf(pdfPage, { hard = false, blank = false } = {}) {
  const leaf = document.createElement("div");
  leaf.className = blank ? "leaf leaf-blank" : "leaf";
  if (blank) {
    leaf.dataset.blank = "1";
  } else {
    leaf.dataset.page = String(pdfPage);
    leaf.appendChild(document.createElement("canvas"));
  }
  if (hard) leaf.dataset.density = "hard";
  return leaf;
}

function buildLeaves() {
  const host = ensureBook();
  host.innerHTML = "";
  host.appendChild(makeLeaf(1, { hard: true }));
  host.appendChild(makeLeaf(0, { blank: true }));
  for (let i = 2; i <= pdf.numPages - 1; i++) host.appendChild(makeLeaf(i));
  if (pdf.numPages >= 2) host.appendChild(makeLeaf(pdf.numPages, { hard: true }));
}

function createFlip() {
  const host = ensureBook();
  const { w, h, landscape, spreadW } = bookMetrics();
  shell.style.width = `${spreadW}px`;
  shell.style.height = `${h}px`;
  host.style.width = `${spreadW}px`;
  host.style.height = `${h}px`;

  flip = new St.PageFlip(host, {
    width: w,
    height: h,
    size: "fixed",
    showCover: true,
    drawShadow: true,
    flippingTime: 850,
    maxShadowOpacity: 0.5,
    usePortrait: !landscape,
    mobileScrollSupport: false,
    startZIndex: 2,
    autoSize: false,
    swipeDistance: 20,
    useMouseEvents: true,
    disableFlipByClick: false,
  });

  flip.on("flip", (e) => {
    paintAround(e.data);
    markPages();
  });
  flip.on("changeState", (e) => {
    if (e.data === "read") markPages();
  });

  flip.loadFromHTML(host.querySelectorAll(".leaf"));
}

function goTo(page1) {
  if (!flip || !pdf) return;
  const idx = pdfToFlipIndex(page1);
  paintAround(idx);
  flip.turnToPage(idx);
  markPages();
}

function applyZoom() {
  shell.style.transform = `scale(${zoom})`;
  shell.style.transformOrigin = "center center";
}

document.getElementById("prev").addEventListener("click", (e) => {
  e.stopPropagation();
  flip && flip.flipPrev("bottom");
});
document.getElementById("next").addEventListener("click", (e) => {
  e.stopPropagation();
  flip && flip.flipNext("bottom");
});
document.getElementById("zoom-in").addEventListener("click", (e) => {
  e.stopPropagation();
  zoom = Math.min(1.6, +(zoom + 0.1).toFixed(2));
  applyZoom();
});
document.getElementById("zoom-out").addEventListener("click", (e) => {
  e.stopPropagation();
  zoom = Math.max(0.6, +(zoom - 0.1).toFixed(2));
  applyZoom();
});

document.getElementById("jump-form").addEventListener("submit", (e) => {
  e.preventDefault();
  e.stopPropagation();
  goTo(parseInt(pageJump.value || "1", 10));
});

document.getElementById("resume-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const last = readLastStored();
  if (last) goTo(last);
});

const backdrop = document.getElementById("side-backdrop");

function setSideOpen(open) {
  side.classList.toggle("open", open);
  if (backdrop) backdrop.hidden = !open;
}

document.getElementById("toggle-side").addEventListener("click", (e) => {
  e.stopPropagation();
  setSideOpen(!side.classList.contains("open"));
});
if (backdrop) {
  backdrop.addEventListener("click", () => setSideOpen(false));
}

document.addEventListener("keydown", (e) => {
  if (inSidePanel(e.target) || (e.target?.tagName || "").toLowerCase() === "input") return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && ["s", "p", "c", "a", "u"].includes(k)) e.preventDefault();
  if (k === "printscreen") {
    e.preventDefault();
    document.body.style.filter = "blur(18px)";
    setTimeout(() => (document.body.style.filter = ""), 1500);
  }
  if (!flip) return;
  if (k === "arrowright" || k === "pagedown") {
    e.preventDefault();
    flip.flipNext("bottom");
  }
  if (k === "arrowleft" || k === "pageup") {
    e.preventDefault();
    flip.flipPrev("bottom");
  }
});

let rebuildTimer = 0;
async function rebuild() {
  if (!pdf) return;
  const idx = flip ? flip.getCurrentPageIndex() : 0;
  if (flip) {
    try {
      flip.destroy();
    } catch (_) {}
    flip = null;
  }
  painted.clear();
  buildLeaves();
  createFlip();
  flip.turnToPage(idx);
  await paintAround(idx);
  applyZoom();
  markPages();
}

window.addEventListener("resize", () => {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuild, 250);
});

fillWatermark();
lastPageEl.textContent = readLastStored() ? String(readLastStored()) : "—";

const url = `/api/book?t=${encodeURIComponent(token)}`;
if (!window.St || !St.PageFlip) {
  pageInd.textContent = "Flip engine missing";
} else {
  pageInd.textContent = "Loading…";
  pdfjsLib
    .getDocument({ url, withCredentials: true })
    .promise.then(async (doc) => {
      pdf = doc;
      buildIndex();
      buildLeaves();
      createFlip();
      const last = readLastStored();
      const startIdx = last > 1 ? pdfToFlipIndex(last) : 0;
      if (last > 1) flip.turnToPage(startIdx);
      await paintAround(startIdx);
      markPages();
    })
    .catch((err) => {
      pageInd.textContent = "Unable to load";
      console.error(err);
    });
}
