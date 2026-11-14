/* library.js — the 3D shelf: rendering, search, category filters, featured,
   recently opened, favourites and reading-progress indicators. */

import { books, categories, readingMinutes } from "./data.js";
import { getCoverURL } from "./covers.js";
import { store } from "./storage.js";

const pad2 = (n) => String(n).padStart(2, "0");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const heartSVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
export { heartSVG };

/** Markup of one 3D shelf book (also used by the reader for the fly-in/out clone). */
export function shelfBookHTML(book, { lazy = true } = {}) {
  const t = 30 + book.content.length * 1.3;
  const bg = lazy ? "" : `style="background-image:url(${getCoverURL(book)})"`;
  return `<div class="book-3d" style="--t:${t.toFixed(1)}px;--c0:${book.colors[0]};--c1:${book.colors[1]}">
    <div class="bk-face bk-front" ${lazy ? "data-cover" : ""} ${bg}></div>
    <div class="bk-face bk-spine"><span>${esc(book.title)}</span></div>
    <div class="bk-face bk-edge"></div>
    <div class="bk-face bk-top"></div>
    <div class="bk-face bk-back"></div>
  </div>`;
}

export class Library {
  constructor({ grid, filters, search, count, empty, featured, recentWrap, recentRail, onSelect }) {
    Object.assign(this, { grid, filters, search, count, empty, featured, recentWrap, recentRail, onSelect });
    this.category = "All";
    this.query = "";
    this.io = new IntersectionObserver((entries) => this.lazyLoad(entries), { rootMargin: "240px" });

    this.renderFilters();
    this.render();
    this.renderFeatured();
    this.renderRecent();
    this.bind();
  }

  /* ---------------------------------------------------------------- data */
  get filtered() {
    const q = this.query;
    return books.filter((b) => {
      const inCat = this.category === "All" ? true
        : this.category === "Favorites" ? store.isFavorite(b.id)
        : b.category === this.category;
      const inQuery = !q || `${b.title} ${b.author} ${b.category}`.toLowerCase().includes(q);
      return inCat && inQuery;
    });
  }

  /* ------------------------------------------------------------- filters */
  renderFilters() {
    const items = ["All", ...categories, "Favorites"];
    this.filters.innerHTML = items.map((c) => {
      const label = c === "Favorites" ? `${heartSVG.replace('width="16" height="16"', 'width="13" height="13"')} Favorites <b id="favCount">${store.favorites().length}</b>` : esc(c);
      return `<button type="button" class="filter-btn${c === this.category ? " active" : ""}" data-category="${esc(c)}" aria-pressed="${c === this.category}">${label}</button>`;
    }).join("");
  }

  setCategory(cat) {
    this.category = cat;
    this.filters.querySelectorAll(".filter-btn").forEach((b) => {
      const on = b.dataset.category === cat;
      b.classList.toggle("active", on); b.setAttribute("aria-pressed", on);
    });
    this.render();
  }

  /* -------------------------------------------------------------- cards */
  cardHTML(book, i, large = false) {
    const total = book.content.length;
    const pct = store.percent(book.id, total);
    const fav = store.isFavorite(book.id);
    return `<article class="book-card${large ? " card-lg" : ""}" data-id="${book.id}" tabindex="0" role="button"
        aria-label="${esc(book.title)} by ${esc(book.author)}. Open book" style="--i:${i}">
      <div class="shelf-book">${shelfBookHTML(book)}<span class="floor-shadow"></span></div>
      <button type="button" class="fav-btn${fav ? " on" : ""}" data-fav="${book.id}" aria-label="${fav ? "Remove from" : "Add to"} favorites" aria-pressed="${fav}">${heartSVG}</button>
      <div class="card-meta">
        <div class="card-cat">${esc(book.category)}</div>
        <h3 class="card-title">${esc(book.title)}</h3>
        <div class="card-author">${esc(book.author)}</div>
        <div class="card-foot">
          <span>${book.year} · ${readingMinutes(book)} min</span>
          <span class="card-progress${pct ? "" : " hidden"}" data-progress="${book.id}"><i style="width:${pct}%"></i><em>${pct}%</em></span>
        </div>
      </div>
    </article>`;
  }

  render() {
    const list = this.filtered;
    this.count.textContent = `${pad2(list.length)} ${list.length === 1 ? "BOOK" : "BOOKS"}`;
    this.empty.classList.toggle("hidden", list.length > 0);
    this.empty.textContent = this.category === "Favorites" && !this.query
      ? "No favorites yet — tap the heart on any book to save it here."
      : "No books found. Try another search or category.";
    this.grid.innerHTML = list.map((b, i) => this.cardHTML(b, i)).join("");
    this.observeCovers(this.grid);
  }

  renderFeatured() {
    if (!this.featured) return;
    const list = books.filter((b) => b.featured).slice(0, 4);
    this.featured.innerHTML = list.map((b, i) => this.cardHTML(b, i, true)).join("");
    this.observeCovers(this.featured);
  }

  renderRecent() {
    if (!this.recentRail) return;
    const items = store.recent().map((id) => books.find((b) => b.id === id)).filter(Boolean);
    this.recentWrap.classList.toggle("hidden", !items.length);
    this.recentRail.innerHTML = items.map((b) => {
      const total = b.content.length;
      const pct = store.percent(b.id, total);
      return `<button type="button" class="recent-item" data-id="${b.id}" aria-label="Continue ${esc(b.title)}">
        <span class="recent-cover" data-cover></span>
        <span class="recent-info"><b>${esc(b.title)}</b><small>${esc(b.author)}</small>
          <span class="recent-bar"><i style="width:${pct}%"></i></span><small>${pct ? `${pct}% read` : "Not started"}</small></span>
      </button>`;
    }).join("");
    this.observeCovers(this.recentRail);
  }

  /** Re-sync progress bars / favourites without rebuilding the grid. */
  refresh() {
    document.querySelectorAll("[data-progress]").forEach((el) => {
      const b = books.find((x) => x.id === el.dataset.progress);
      const pct = store.percent(b.id, b.content.length);
      el.classList.toggle("hidden", !pct);
      el.querySelector("i").style.width = `${pct}%`;
      el.querySelector("em").textContent = `${pct}%`;
    });
    document.querySelectorAll("[data-fav]").forEach((el) => this.paintFav(el, store.isFavorite(el.dataset.fav)));
    const fc = document.getElementById("favCount"); if (fc) fc.textContent = store.favorites().length;
    this.renderRecent();
  }

  paintFav(el, on) {
    el.classList.toggle("on", on); el.setAttribute("aria-pressed", on);
    el.setAttribute("aria-label", `${on ? "Remove from" : "Add to"} favorites`);
  }

  /* ----------------------------------------------------- lazy cover images */
  observeCovers(root) { root.querySelectorAll("[data-cover]").forEach((el) => this.io.observe(el)); }

  lazyLoad(entries) {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target; this.io.unobserve(el);
      const id = el.closest("[data-id]")?.dataset.id;
      const book = books.find((b) => b.id === id);
      if (!book) continue;
      try { el.style.backgroundImage = `url(${getCoverURL(book)})`; el.removeAttribute("data-cover"); el.classList.add("loaded"); }
      catch (err) { console.warn("Cover failed", err); el.classList.add("cover-error"); }
    }
  }

  /* ------------------------------------------------------------ events */
  bind() {
    this.filters.addEventListener("click", (e) => {
      const b = e.target.closest("[data-category]"); if (b) this.setCategory(b.dataset.category);
    });
    this.search.addEventListener("input", () => { this.query = this.search.value.trim().toLowerCase(); this.render(); });

    for (const root of [this.grid, this.featured, this.recentRail].filter(Boolean)) {
      root.addEventListener("click", (e) => {
        const fav = e.target.closest("[data-fav]");
        if (fav) {
          e.stopPropagation();
          const on = store.toggleFavorite(fav.dataset.fav);
          this.paintFav(fav, on); this.refresh();
          if (this.category === "Favorites") this.render();
          this.onFavorite?.(fav.dataset.fav, on);
          return;
        }
        this.activate(e.target.closest("[data-id]"));
      });
      root.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-id]")) { e.preventDefault(); this.activate(e.target); }
      });
      this.bindTilt(root);
    }
  }

  activate(card) {
    if (!card) return;
    const book = books.find((b) => b.id === card.dataset.id);
    const el = card.querySelector(".book-3d");
    if (book) this.onSelect(book, el);
  }

  /** Cursor-follow tilt (mouse only; touch devices get the lift on :active). */
  bindTilt(root) {
    let raf = 0, last = null;
    const apply = () => {
      raf = 0; if (!last) return;
      const { el, x, y } = last;
      el.style.setProperty("--tx", x.toFixed(3)); el.style.setProperty("--ty", y.toFixed(3));
    };
    root.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const card = e.target.closest(".book-card"); if (!card) return;
      const stage = card.querySelector(".shelf-book"), el = card.querySelector(".book-3d");
      const r = stage.getBoundingClientRect();
      last = { el, x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 };
      if (!raf) raf = requestAnimationFrame(apply);
    });
    root.addEventListener("pointerout", (e) => {
      const card = e.target.closest?.(".book-card"); if (!card || card.contains(e.relatedTarget)) return;
      const el = card.querySelector(".book-3d");
      el.style.setProperty("--tx", 0); el.style.setProperty("--ty", 0); last = null;
    });
  }

  /** Locate the 3D book element for a book id (used to fly the book back). */
  findBookEl(id) {
    const card = document.querySelector(`#bookGrid .book-card[data-id="${id}"]`) || document.querySelector(`.book-card[data-id="${id}"]`);
    return card?.querySelector(".book-3d") || null;
  }
}
