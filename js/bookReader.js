/* bookReader.js — the immersive 3D book reader.

   Flow:  shelf book → (lifted & flown to centre) → details panel
          → "Read Book": cover opens → two-page spread → turn pages → close.

   Page model ("faces"): [cover, endpaper, p1 … pN, (blank), colophon]
   Two-page mode: a leaf holds two faces (front = right page, back = left page).
   Single-page mode (phones): one face at a time.
   A page turn is a real flipper built from vertical strips that bend while
   they rotate, with dynamic shading and cast shadows on the pages below. */

import { figures, readingMinutes } from "./data.js";
import { getCoverURL } from "./covers.js";
import { shelfBookHTML } from "./library.js";
import { store } from "./storage.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const RATIO = 0.72;            // page width / height
const REST_ANGLE = 26;         // resting Y rotation of a shelf book (deg)

export class BookReader {
  constructor({ library, onClose, onFavorite, toast, getHeroOrigin }) {
    Object.assign(this, { library, onClose, onFavorite, toast, getHeroOrigin });
    this.el = {
      root: $("reader"), backdrop: $("readerBackdrop"), stage: $("readerStage"), rig: $("bookRig"),
      book: $("readerBook"), pgL: $("pgL"), pgR: $("pgR"), flipper: $("flipper"), floor: $("bookFloor"),
      panel: $("detailPanel"), controls: $("readerControls"), hint: $("readerHint"),
      close: $("closeReader"), closeLabel: $("closeLabel"), barTitle: $("readerBarTitle"),
      bookmark: $("bookmarkBtn"), fav: $("readerFav"), prev: $("prevPage"), next: $("nextPage"),
      indicator: $("pageIndicator"), fill: $("progressFill"), pct: $("progressPct"),
      readBtn: $("readBtn"), detailFav: $("detailFav"), flyers: $("flyerLayer"),
    };
    this.state = "closed";
    this.book = null; this.faces = []; this.mode = "double";
    this.pos = 0; this.busy = false; this.queue = 0; this.fit = [];
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", (e) => (this.reduced = e.matches));
    this.bind();
  }

  /* ============================================================= binding */
  bind() {
    const { el } = this;
    el.close.addEventListener("click", () => this.close());
    el.prev.addEventListener("click", () => this.turn(-1));
    el.next.addEventListener("click", () => this.turn(1));
    el.readBtn.addEventListener("click", () => this.startReading());
    const toggleFav = () => { if (!this.book) return; const on = store.toggleFavorite(this.book.id); this.paintFav(); this.onFavorite?.(this.book, on); };
    el.fav.addEventListener("click", toggleFav);
    el.detailFav.addEventListener("click", toggleFav);
    el.bookmark.addEventListener("click", () => this.toggleBookmark());

    // page clicks
    el.pgL.addEventListener("click", (e) => this.onPageClick(e, -1));
    el.pgR.addEventListener("click", (e) => this.onPageClick(e, 1));
    el.panel.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-goto]");
      if (chip) this.startReading(Number(chip.dataset.goto));
    });

    // keyboard
    document.addEventListener("keydown", (e) => {
      if (this.state === "closed") return;
      if (e.key === "Tab") return this.trapFocus(e);
      if (e.key === "Escape") { e.preventDefault(); return this.close(); }
      if (this.state === "detail" && (e.key === "Enter" && document.activeElement === document.body)) return this.startReading();
      if (this.state !== "reading") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); this.turn(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); this.turn(-1); }
      else if (e.key === "Home") { e.preventDefault(); this.jumpTo(this.posForFace(2)); }
      else if (e.key === "End") { e.preventDefault(); this.jumpTo(this.maxPos); }
      else if (e.key.toLowerCase() === "b") this.toggleBookmark();
    });

    // swipe (touch / pen) — vertical scrolling is not needed inside the reader
    let sx = null, sy = null, st = 0;
    el.stage.addEventListener("touchstart", (e) => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    el.stage.addEventListener("touchend", (e) => {
      if (sx === null) return;
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - st < 800) {
        this.swiped = true; setTimeout(() => (this.swiped = false), 350);
        this.turn(dx < 0 ? 1 : -1);
      }
    }, { passive: true });

    // subtle parallax tilt of the book while reading
    el.stage.addEventListener("pointermove", (e) => {
      if (this.state !== "reading" || this.reduced || e.pointerType !== "mouse") return;
      const r = el.stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      this.tiltX?.(this.readTilt.x - ny * 3); this.tiltY?.(nx * 5);
    });

    let t = 0;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => this.onResize(), 140); });
  }

  trapFocus(e) {
    const nodes = [...this.el.root.querySelectorAll("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")].filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (!this.el.root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ============================================================== layout */
  get maxPos() { return this.mode === "double" ? this.faces.length / 2 : this.faces.length - 1; }
  leftIdx(pos) { return this.mode === "double" && pos > 0 ? 2 * pos - 1 : null; }
  rightIdx(pos) { return this.mode === "double" ? (pos < this.maxPos ? 2 * pos : null) : pos; }
  posForFace(idx) { return this.mode === "double" ? Math.min(this.maxPos, Math.ceil(idx / 2)) : Math.min(this.maxPos, idx); }
  d(x) { return this.reduced ? 0.01 : x; }

  layout() {
    const { el } = this;
    const vw = window.innerWidth;
    const mode = vw < 760 ? "single" : "double";
    const sr = el.stage.getBoundingClientRect();
    const pw = mode === "double"
      ? Math.min((sr.width * 0.92) / 2, sr.height * 0.93 * RATIO, 620)
      : Math.min(sr.width * 0.9, sr.height * 0.94 * RATIO, 440);
    const ph = pw / RATIO;
    el.book.style.setProperty("--pw", `${pw.toFixed(2)}px`);
    el.book.style.setProperty("--ph", `${ph.toFixed(2)}px`);
    el.book.style.setProperty("--edge", `${Math.min(14, Math.max(6, pw * 0.032)).toFixed(1)}px`);
    el.book.dataset.mode = mode;
    const changed = mode !== this.mode;
    this.mode = mode; this.dims = { pw, ph };
    this.stageRect = sr;
    return changed;
  }

  /** Where the closed book sits while the details panel is open. */
  detailTransform() {
    const { stageRect: sr, dims } = this;
    const vw = window.innerWidth, vh = window.innerHeight;
    const cx = sr.left + sr.width / 2, cy = sr.top + sr.height / 2;
    const wide = vw >= 1000;
    const panelH = wide ? 0 : this.el.panel.offsetHeight;
    let x = 0, y = 0, scale = 1;
    if (wide) {
      const panelW = Math.min(440, vw * 0.36);
      x = (panelW + vw) / 2 - cx; y = 0;
    } else {
      const free = vh - panelH - 70;
      scale = Math.min(1, (free * 0.94) / dims.ph);
      y = 70 + free / 2 - cy; x = 0;
    }
    return { x, y, scale };
  }

  onResize() {
    if (this.state === "closed" || !this.book) return;
    const changed = this.layout();
    this.computeFit();
    if (changed) this.pos = this.posForFace(this.currentFace());
    if (this.busy) { this.finishFlip?.(true); }
    this.renderStatic(); this.applyBookShift(false);
    if (this.state === "detail") { const t = this.detailTransform(); gsap.set(this.el.rig, { x: t.x, y: t.y, scale: t.scale }); }
  }

  /** Measure each face in an off-screen probe and store a font-scale so nothing overflows. */
  computeFit() {
    const probe = document.createElement("div");
    probe.className = "probe";
    this.el.book.appendChild(probe);
    this.fit = this.faces.map((f, i) => {
      if (f.k !== "page") return 1;
      let k = 1;
      for (let n = 0; n < 7; n++) {
        probe.innerHTML = this.faceHTML(f, i, k);
        const pi = probe.querySelector(".pi");
        if (!pi || pi.scrollHeight <= pi.clientHeight + 1) break;
        k -= 0.055;
      }
      return k;
    });
    probe.remove();
  }

  /* ========================================================== face HTML */
  buildFaces(book) {
    const F = [{ k: "cover" }, { k: "inside" }];
    book.content.forEach((p, i) => F.push({ k: "page", page: p, n: i + 1 }));
    if ((F.length + 1) % 2) F.push({ k: "blank" });
    F.push({ k: "end" });
    return F;
  }

  faceHTML(f, idx, k = this.fit[idx] ?? 1) {
    const book = this.book, total = book.content.length;
    const side = this.mode === "single" || idx % 2 === 0 ? "r" : "l";
    const style = k < 1 ? ` style="--k:${k.toFixed(3)}"` : "";
    switch (f.k) {
      case "cover":
        return `<div class="cover-face" style="background-image:url(${getCoverURL(book)})"><span class="cover-hinge"></span><span class="cover-sheen"></span></div>`;
      case "inside":
        return `<div class="pagebox side-${side} endpaper"><div class="pi center">
          <div class="exlibris">EX LIBRIS</div><div class="orn">✦</div>
          <h3 class="end-title">${esc(book.title)}</h3><p class="end-sub">${esc(book.author)}</p>
          <div class="orn small">· · ·</div>
          <p class="end-meta">${esc(book.category)} · ${book.year}<br>${total} pages · about ${readingMinutes(book)} min</p></div></div>`;
      case "blank":
        return `<div class="pagebox side-${side}"><div class="pi center"><div class="orn faint">✦</div></div></div>`;
      case "end":
        return `<div class="pagebox side-${side} endpaper"><div class="pi center">
          <div class="orn">✦</div><h3 class="end-title">The End</h3>
          <p class="end-sub">Thank you for reading<br><em>${esc(book.title)}</em></p>
          <div class="end-actions"><button type="button" class="mini-btn" data-action="restart">Read again</button><button type="button" class="mini-btn ghost" data-action="close">Close book</button></div></div></div>`;
      default: {
        const p = f.page;
        let inner = "";
        const paras = (p.p || []).map((t, i) => `<p${i === 0 && p.t === "chapter" ? ' class="dropcap"' : ""}>${esc(t)}</p>`).join("");
        if (p.t === "chapter") inner = `<div class="ch-no">Chapter ${ROMAN[p.n] || p.n}</div><h3 class="ch-title">${esc(p.title)}</h3><div class="orn small">✦</div>${paras}`;
        else if (p.t === "figure") inner = `<figure class="pg-fig">${figures[p.fig] || ""}<figcaption>${esc(p.caption)}</figcaption></figure>${paras}`;
        else if (p.t === "quote") inner = `<blockquote><span>“</span>${esc(p.q)}<cite>— ${esc(p.by)}</cite></blockquote>${paras}`;
        else inner = `<h4 class="pg-title">${esc(p.title)}</h4>${paras}`;
        const mark = store.hasBookmark(book.id, f.n) ? " on" : "";
        return `<div class="pagebox side-${side}"${style}><div class="run">${esc(side === "r" ? book.author : book.title)}</div>
          <div class="pi">${inner}</div><span class="pnum">${f.n}</span><i class="ribbon${mark}" data-ribbon="${f.n}"></i></div>`;
      }
    }
  }

  setFace(pg, idx) {
    const box = pg.querySelector(".box");
    if (idx == null) { box.innerHTML = ""; pg.classList.add("empty"); pg.dataset.kind = ""; return; }
    const f = this.faces[idx];
    box.innerHTML = this.faceHTML(f, idx);
    pg.classList.remove("empty"); pg.dataset.kind = f.k;
  }

  /* ========================================================== state sync */
  renderStatic() {
    this.setFace(this.el.pgL, this.leftIdx(this.pos));
    this.setFace(this.el.pgR, this.rightIdx(this.pos));
    this.setThickness(this.pos);
    this.el.book.classList.toggle("no-left", this.mode === "double" && this.pos === 0);
    this.el.book.classList.toggle("no-right", this.mode === "double" && this.pos === this.maxPos);
    this.el.book.classList.toggle("is-cover", this.pos === 0);
    this.updateUI();
  }

  setThickness(pos) {
    const consumed = this.mode === "double" ? pos * 2 : pos;
    const ratio = consumed / this.faces.length;
    const edge = parseFloat(this.el.book.style.getPropertyValue("--edge")) || 10;
    this.el.book.style.setProperty("--tl", `${(edge * ratio).toFixed(1)}px`);
    this.el.book.style.setProperty("--tr", `${(edge * (1 - ratio)).toFixed(1)}px`);
  }

  bookShiftFor(pos) {
    if (this.mode !== "double") return 0;
    const pw = this.dims.pw;
    return pos === 0 ? -pw / 2 : pos === this.maxPos ? pw / 2 : 0;
  }
  applyBookShift(animate, dur = 1) {
    const x = this.bookShiftFor(this.pos);
    if (animate) gsap.to(this.el.book, { x, duration: this.d(dur), ease: "power2.inOut", overwrite: true });
    else gsap.set(this.el.book, { x });
  }

  currentFace() {
    const r = this.rightIdx(this.pos), l = this.leftIdx(this.pos);
    return r ?? l ?? 0;
  }

  visiblePages() {
    return [this.leftIdx(this.pos), this.rightIdx(this.pos)]
      .filter((i) => i != null && this.faces[i].k === "page").map((i) => this.faces[i].n);
  }

  updateUI() {
    const { el } = this;
    const total = this.book.content.length;
    const pages = this.visiblePages();
    const cur = pages.length ? Math.max(...pages) : (this.pos === 0 ? 0 : (this.pos >= this.maxPos ? total : 0));
    let label;
    if (this.pos === 0) label = "Cover";
    else if (!pages.length) label = this.pos >= this.maxPos ? "The End" : "Endpapers";
    else label = pages.length > 1 ? `Pages ${pages[0]}–${pages[1]}` : `Page ${pages[0]}`;
    el.indicator.innerHTML = `<b>${label}</b><span>${pages.length || this.pos >= this.maxPos ? `of ${total}` : "Beyond Pages"}</span>`;
    const pct = Math.round((cur / total) * 100);
    el.fill.style.width = `${pct}%`; el.pct.textContent = `${pct}%`;
    el.prev.disabled = this.pos === 0; el.next.disabled = this.pos >= this.maxPos;
    this.paintBookmark();
    if (this.state === "reading" && this.pos > 0) this.saveProgress(cur);
  }

  saveProgress(cur) {
    const prev = store.getProgress(this.book.id);
    store.setProgress(this.book.id, { face: this.currentFace(), page: Math.max(prev?.page || 0, cur), total: this.book.content.length });
  }

  primaryPage() {
    const r = this.rightIdx(this.pos), l = this.leftIdx(this.pos);
    for (const i of [r, l]) if (i != null && this.faces[i].k === "page") return this.faces[i].n;
    return null;
  }
  paintBookmark() {
    const n = this.primaryPage();
    const on = n != null && store.hasBookmark(this.book.id, n);
    this.el.bookmark.classList.toggle("on", on); this.el.bookmark.setAttribute("aria-pressed", on);
    this.el.bookmark.disabled = n == null;
  }
  toggleBookmark() {
    const n = this.primaryPage(); if (n == null || !this.book) return;
    const on = store.toggleBookmark(this.book.id, n);
    this.el.book.querySelectorAll(`[data-ribbon="${n}"]`).forEach((r) => r.classList.toggle("on", on));
    this.paintBookmark(); this.renderBookmarkChips();
    this.toast?.(on ? `Bookmarked page ${n}` : `Bookmark removed from page ${n}`);
  }
  paintFav() {
    const on = this.book && store.isFavorite(this.book.id);
    for (const b of [this.el.fav, this.el.detailFav]) { b.classList.toggle("on", !!on); b.setAttribute("aria-pressed", !!on); }
    this.el.detailFav.querySelector("span").textContent = on ? "In favorites" : "Add to favorites";
  }
  renderBookmarkChips() {
    const wrap = $("detailBookmarks"), list = store.bookmarks(this.book.id);
    wrap.classList.toggle("hidden", !list.length);
    wrap.querySelector(".chips").innerHTML = list.map((n) => `<button type="button" class="chip" data-goto="${n}">p. ${n}</button>`).join("");
  }

  /* ============================================================ details */
  fillDetails(book) {
    const total = book.content.length, pr = store.getProgress(book.id);
    $("detailCategory").textContent = book.category;
    $("detailTitle").textContent = book.title;
    $("detailAuthor").textContent = `by ${book.author}`;
    $("detailDesc").textContent = book.description;
    $("metaPages").textContent = total;
    $("metaYear").textContent = book.year;
    $("metaTime").textContent = `${readingMinutes(book)} min`;
    $("metaCat").textContent = book.category;
    this.el.barTitle.textContent = book.title;
    const pct = store.percent(book.id, total);
    $("detailProgress").classList.toggle("hidden", !pct);
    $("detailProgressFill").style.width = `${pct}%`;
    $("detailProgressText").textContent = `${pct}% read`;
    this.el.readBtn.querySelector("span").textContent = pr?.page ? "Continue reading" : "Read Book";
    this.paintFav(); this.renderBookmarkChips();
  }

  /* ======================================================= open / close */
  originMetrics(originEl) {
    const rest = { rot: 0, rotX: 0 };
    if (originEl?.isConnected) {
      const r = originEl.getBoundingClientRect();
      if (originEl.classList.contains("book-3d")) {
        const cs = getComputedStyle(originEl);
        return { w: originEl.offsetWidth, h: originEl.offsetHeight, t: parseFloat(cs.getPropertyValue("--t")) || 36, cx: r.left + r.width / 2, cy: r.top + r.height / 2, rot: REST_ANGLE, rotX: -4 };
      }
      return { w: r.width, h: r.height, t: Math.max(10, r.width * 0.16), cx: r.left + r.width / 2, cy: r.top + r.height / 2, ...rest };
    }
    const h = this.getHeroOrigin?.();
    if (h) return { w: 90, h: 125, t: 22, cx: h.x, cy: h.y, rot: 20, rotX: -6 };
    return { w: 110, h: 153, t: 24, cx: window.innerWidth / 2, cy: window.innerHeight / 2, rot: 0, rotX: 0 };
  }

  makeFlyer(book, o) {
    const layer = this.el.flyers;
    const wrap = document.createElement("div");
    wrap.className = "flyer";
    wrap.style.cssText = `left:${o.cx - o.w / 2}px;top:${o.cy - o.h / 2}px;width:${o.w}px;height:${o.h}px;--w:${o.w}px;--h:${o.h}px`;
    wrap.innerHTML = shelfBookHTML(book, { lazy: false });
    const b3 = wrap.querySelector(".book-3d");
    b3.style.setProperty("--t", `${o.t}px`);
    layer.appendChild(wrap);
    return { wrap, b3 };
  }

  /** Centre and width of the closed cover for a given rig transform. */
  coverTarget(t) {
    const sr = this.stageRect;
    return { cx: sr.left + sr.width / 2 + t.x, cy: sr.top + sr.height / 2 + t.y, width: this.dims.pw * t.scale };
  }

  open(book, originEl) {
    if (this.state !== "closed") return;
    const { el } = this;
    this.state = "opening";
    this.book = book; this.originEl = originEl;
    this.faces = this.buildFaces(book);
    this.pos = 0; this.busy = false; this.queue = 0;
    this.lastFocus = document.activeElement;

    el.root.hidden = false; el.root.setAttribute("aria-hidden", "false");
    document.body.classList.add("reader-open");
    document.getElementById("app")?.setAttribute("inert", "");
    el.root.classList.remove("is-reading"); el.root.classList.add("is-detail");

    el.book.style.setProperty("--c0", book.colors[0]);
    el.book.style.setProperty("--c1", book.colors[1]);
    this.fillDetails(book);
    this.layout(); this.computeFit(); this.renderStatic(); this.applyBookShift(false);
    const t = this.detailTransform();
    this.readTilt = { x: this.mode === "double" ? 9 : 5 };
    gsap.set(el.rig, { x: t.x, y: t.y, scale: t.scale, rotationX: 0, rotationY: 0, opacity: 0 });
    gsap.set(el.panel, { opacity: 0 }); gsap.set(el.controls, { opacity: 0, y: 24 });
    gsap.set(el.hint, { opacity: 0 });
    gsap.fromTo(el.backdrop, { opacity: 0 }, { opacity: 1, duration: this.d(0.6), ease: "power2.out" });
    gsap.fromTo(".reader-bar", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: this.d(0.6), delay: 0.15, ease: "power3.out" });
    el.closeLabel.textContent = "Back to library";

    const done = () => {
      gsap.set(el.rig, { opacity: 1 });
      this.state = "detail";
      this.showPanel();
      el.readBtn.focus({ preventScroll: true });
    };

    if (this.reduced) { gsap.set(el.rig, { opacity: 1 }); originEl?.closest(".book-card")?.classList.add("picked"); return done(); }

    // fly the shelf book to the centre of the screen
    const o = this.originMetrics(originEl);
    originEl?.closest(".book-card")?.classList.add("picked");
    const { wrap, b3 } = this.makeFlyer(book, o);
    const tgt = this.coverTarget(t);
    const S = tgt.width / o.w;
    const tl = gsap.timeline({ onComplete: () => { wrap.remove(); done(); } });
    tl.set(b3, { rotationY: o.rot, rotationX: o.rotX })
      .to(wrap, { y: "-=26", scale: 1.1, duration: 0.28, ease: "power2.out" })
      .to(wrap, { x: tgt.cx - o.cx, duration: 1.0, ease: "power3.inOut" }, ">-0.02")
      .to(wrap, { y: tgt.cy - o.cy, duration: 1.0, ease: "power2.inOut" }, "<")
      .to(wrap, { scale: S, duration: 1.0, ease: "power3.inOut" }, "<")
      .to(b3, { rotationY: 0, rotationX: 0, duration: 0.95, ease: "power3.inOut" }, "<");
  }

  showPanel() {
    const wide = window.innerWidth >= 1000;
    const { el } = this;
    gsap.fromTo(el.panel, wide ? { x: -50, opacity: 0 } : { y: 50, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: this.d(0.7), ease: "power3.out" });
    gsap.fromTo("#detailPanel .stagger", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: this.d(0.6), stagger: 0.06, delay: 0.1, ease: "power2.out" });
    // gentle idle sway of the closed book
    if (!this.reduced) {
      this.idle?.kill();
      this.idle = gsap.to(el.rig, { rotationY: -7, rotationX: 4, duration: 3.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
    }
  }

  /* ---- detail → reading (the cover opens) */
  startReading(targetPage) {
    if (this.state !== "detail") return;
    this.state = "opening";
    const { el } = this;
    this.idle?.kill();
    el.root.classList.remove("is-detail"); el.root.classList.add("is-reading");
    el.closeLabel.textContent = "Close book";
    store.touchRecent(this.book.id);

    gsap.to(el.panel, { opacity: 0, x: window.innerWidth >= 1000 ? -40 : 0, y: window.innerWidth >= 1000 ? 0 : 40, duration: this.d(0.45), ease: "power2.in" });
    gsap.to(el.rig, { x: 0, y: 0, scale: 1, rotationX: this.readTilt.x, rotationY: 0, duration: this.d(1.2), ease: "power3.inOut", overwrite: "auto" });
    gsap.to(el.controls, { opacity: 1, y: 0, duration: this.d(0.7), delay: this.d(0.7), ease: "power2.out" });

    // where to land: explicit page → saved face → first spread
    const saved = store.getProgress(this.book.id);
    let landing = 2;
    if (targetPage) landing = this.faces.findIndex((f) => f.n === targetPage);
    else if (saved?.face > 1) landing = saved.face;
    const landPos = Math.max(1, this.posForFace(Math.max(2, landing)));

    this.flip(1, () => {
      this.state = "reading";
      this.updateUI();
      this.setupTilt();
      const go = () => { this.showHint(); this.el.next.focus({ preventScroll: true }); };
      if (landPos > 1) this.jumpTo(landPos, go); else go();
    }, 1.35);
  }

  setupTilt() {
    this.tiltX = gsap.quickTo(this.el.rig, "rotationX", { duration: 0.8, ease: "power2.out" });
    this.tiltY = gsap.quickTo(this.el.rig, "rotationY", { duration: 0.8, ease: "power2.out" });
  }

  showHint() {
    const { hint } = this.el;
    hint.textContent = this.mode === "single" ? "Swipe or tap the page edges to turn" : "Click a page, press ← → or swipe to turn";
    gsap.timeline().to(hint, { opacity: 1, duration: 0.5 }).to(hint, { opacity: 0, duration: 0.8, delay: 3.2 });
  }

  /* ---- close: reading → closed book → back to the shelf */
  close() {
    if (this.state === "closed" || this.state === "closing") return;
    if (this.state === "opening") return;
    const { el } = this;
    this.idle?.kill();
    const prevState = this.state;
    this.state = "closing";
    this.queue = 0;
    gsap.to(el.controls, { opacity: 0, y: 20, duration: this.d(0.3) });
    gsap.to(el.panel, { opacity: 0, duration: this.d(0.3) });
    gsap.to(el.hint, { opacity: 0, duration: 0.2 });

    const finish = () => this.flyBack();
    if (prevState !== "reading" || this.pos === 0) return finish();

    const closeCover = () => {
      gsap.to(el.rig, { rotationX: 0, rotationY: 0, duration: this.d(0.9), ease: "power2.inOut" });
      this.flip(-1, finish, 1.2);
    };
    if (this.pos > 1) this.jumpTo(1, closeCover, true); else closeCover();
  }

  flyBack() {
    const { el } = this;
    const book = this.book;
    const originEl = this.library?.findBookEl(book.id) || (this.originEl?.isConnected ? this.originEl : null);
    const card = originEl?.closest(".book-card");
    const finalize = () => {
      el.flyers.innerHTML = "";
      card?.classList.remove("picked");
      el.root.hidden = true; el.root.setAttribute("aria-hidden", "true");
      el.root.classList.remove("is-reading", "is-detail");
      document.body.classList.remove("reader-open");
      document.getElementById("app")?.removeAttribute("inert");
      gsap.set([el.rig, el.panel, el.controls, el.backdrop, el.book, el.hint, ".reader-bar", "#detailPanel .stagger"], { clearProps: "all" });
      this.state = "closed";
      (card?.isConnected ? card : this.lastFocus)?.focus?.({ preventScroll: true });
      this.onClose?.(book);
      this.book = null;
    };
    if (this.reduced) return finalize();

    const sr = this.stageRect;
    const cur = { x: gsap.getProperty(el.rig, "x"), y: gsap.getProperty(el.rig, "y"), scale: gsap.getProperty(el.rig, "scale") };
    const startCx = sr.left + sr.width / 2 + cur.x, startCy = sr.top + sr.height / 2 + cur.y;
    const coverW = this.dims.pw * cur.scale;
    const o = this.originMetrics(originEl);
    const { wrap, b3 } = this.makeFlyer(book, { ...o, w: o.w, h: o.h });
    // start: flyer sits exactly on the closed book (flat, scaled to cover size)
    const S = coverW / o.w;
    gsap.set(wrap, { x: startCx - o.cx, y: startCy - o.cy, scale: S });
    gsap.set(b3, { rotationY: 0, rotationX: 0 });
    gsap.set(el.rig, { opacity: 0 });
    gsap.timeline({ onComplete: finalize })
      .to(wrap, { x: 0, duration: 0.95, ease: "power3.inOut" })
      .to(wrap, { y: 0, duration: 0.95, ease: "power2.inOut" }, "<")
      .to(wrap, { scale: 1, duration: 0.95, ease: "power3.inOut" }, "<")
      .to(b3, { rotationY: o.rot, rotationX: o.rotX, duration: 0.9, ease: "power3.inOut" }, "<")
      .to(el.backdrop, { opacity: 0, duration: 0.7, ease: "power2.in" }, "<0.2")
      .to(".reader-bar", { opacity: 0, y: -20, duration: 0.4 }, "<");
  }

  /* ========================================================= page turns */
  onPageClick(e, dir) {
    if (this.swiped) return;
    const act = e.target.closest("[data-action]");
    if (act) {
      e.stopPropagation();
      if (act.dataset.action === "close") return this.close();
      if (act.dataset.action === "restart") return this.jumpTo(1);
    }
    if (this.state === "detail") return this.startReading();
    if (this.state === "reading") this.turn(dir);
  }

  turn(dir) {
    if (this.state !== "reading") return;
    if (this.busy) { this.queue = dir; return; }
    const next = this.pos + dir;
    if (next < 0 || next > this.maxPos) return;
    this.flip(dir);
  }

  /** Static jump (no page-by-page flip), used for bookmarks, Home/End and restoring a position. */
  jumpTo(pos, cb, silent = false) {
    pos = Math.max(0, Math.min(this.maxPos, pos));
    if (this.busy) this.finishFlip?.(true);
    if (pos === this.pos) { cb?.(); return; }
    const { book } = this.el;
    const swap = () => { this.pos = pos; this.renderStatic(); this.applyBookShift(false); };
    if (this.reduced) { swap(); cb?.(); return; }
    this.busy = true;
    gsap.timeline({ onComplete: () => { this.busy = false; cb?.(); } })
      .to(book, { opacity: 0, scale: 0.97, duration: silent ? 0.18 : 0.26, ease: "power2.in" })
      .add(swap)
      .to(book, { opacity: 1, scale: 1, duration: silent ? 0.22 : 0.4, ease: "power2.out" });
  }

  /**
   * Flip the leaf in direction `dir` (+1 forward, -1 back).
   * The flipper is built from N vertical strips; each strip is rotated relative to its parent,
   * which makes the sheet bend like paper while it travels around the spine.
   */
  flip(dir, done, duration = 1.05) {
    const double = this.mode === "double";
    const from = this.pos, to = from + dir;
    if (to < 0 || to > this.maxPos) { done?.(); return; }
    this.busy = true;
    const { el, dims } = this;
    const F = this.faces;

    // which faces are on the sheet
    let front, back;
    if (double) { front = dir > 0 ? 2 * from : 2 * from - 2; back = front + 1; }
    else { front = dir > 0 ? from : from - 1; back = null; }

    // underlying pages change straight away on the side that gets uncovered
    if (dir > 0) this.setFace(el.pgR, this.rightIdx(to)); else this.setFace(el.pgL, this.leftIdx(to));
    this.setThickness(to);
    if (double) { // show the side that is about to be used
      el.book.classList.remove("no-left", "no-right");
    }
    this.applyBookShiftTarget(to, duration);

    // build strips
    const N = this.mode === "single" ? 10 : window.innerWidth < 1100 ? 12 : 16;
    const sw = dims.pw / N;
    el.flipper.innerHTML = "";
    const strips = []; let parent = el.flipper;
    const frontHTML = this.faceHTML(F[front], front);
    const backHTML = back != null ? this.faceHTML(F[back], back) : "";
    for (let k = 0; k < N; k++) {
      const st = document.createElement("div"); st.className = "st";
      st.style.width = `${sw + 0.8}px`; if (k) st.style.left = `${sw}px`;
      const sf = document.createElement("div"); sf.className = "sf";
      sf.innerHTML = `<div class="sl" style="left:${-k * sw}px">${frontHTML}</div><i class="sh"></i>`;
      st.appendChild(sf);
      const sb = document.createElement("div"); sb.className = "sb";
      sb.innerHTML = `<div class="sl" style="left:${-(dims.pw - (k + 1) * sw)}px">${backHTML}</div><i class="sh"></i>`;
      st.appendChild(sb);
      parent.appendChild(st); parent = st; strips.push({ st, fsh: sf.querySelector(".sh"), bsh: sb.querySelector(".sh") });
    }
    el.flipper.style.display = "block";
    const castL = el.pgL.querySelector(".cast"), castR = el.pgR.querySelector(".cast");

    const SPAN = double ? 180 : 90, BEND = double ? 38 : 26;
    const render = (p) => {
      const base = -SPAN * p;
      const bend = BEND * Math.sin(2 * Math.PI * p) * (double ? 1 : 0.6);
      const rel = bend / (N - 1);
      strips[0].st.style.transform = `rotateY(${base}deg)`;
      for (let k = 1; k < N; k++) strips[k].st.style.transform = `rotateY(${rel}deg)`;
      for (let k = 0; k < N; k++) {
        const cum = (base + k * rel) * Math.PI / 180;
        const s = Math.abs(Math.sin(cum)) ** 1.15 * 0.5;
        strips[k].fsh.style.opacity = s; strips[k].bsh.style.opacity = s * 0.9;
      }
      castR.style.opacity = 0.6 * Math.sin(Math.min(1, p / 0.62) * Math.PI);
      castL.style.opacity = double ? 0.6 * Math.sin(Math.max(0, (p - 0.38) / 0.62) * Math.PI) : 0;
      if (!double) el.flipper.style.opacity = 1 - Math.max(0, (p - 0.7) / 0.3);
    };

    const prog = { p: dir > 0 ? 0 : 1 };
    render(prog.p);
    let finished = false;
    const finish = (instant = false) => {
      if (finished) return; finished = true;
      tween.kill();
      this.pos = to;
      el.flipper.style.display = "none"; el.flipper.innerHTML = ""; el.flipper.style.opacity = "";
      castL.style.opacity = castR.style.opacity = 0;
      this.renderStatic(); this.applyBookShift(false);
      this.busy = false; this.finishFlip = null;
      done?.();
      if (!instant && this.queue) { const q = this.queue; this.queue = 0; this.turn(q); }
    };
    this.finishFlip = finish;
    const tween = gsap.to(prog, {
      p: dir > 0 ? 1 : 0, duration: this.d(duration), ease: "power2.inOut",
      onUpdate: () => render(prog.p), onComplete: () => finish(),
    });
  }

  applyBookShiftTarget(pos, duration) {
    const pw = this.dims.pw;
    const x = this.mode !== "double" ? 0 : pos === 0 ? -pw / 2 : pos === this.maxPos ? pw / 2 : 0;
    gsap.to(this.el.book, { x, duration: this.d(duration), ease: "power2.inOut", overwrite: true });
  }
}
