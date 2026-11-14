/* main.js — application entry: boots modules and wires them together. */

import { books, categories } from "./data.js";
import { ensureFonts } from "./covers.js";
import { Library, shelfBookHTML } from "./library.js";
import { BookReader } from "./bookReader.js";
import { store } from "./storage.js";
import { initAnimations, initDust, hideLoader, setLoader, showLoaderError } from "./animations.js";

const $ = (id) => document.getElementById(id);
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function toast(message) {
  const t = $("toast");
  t.textContent = message; t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

async function boot() {
  if (!window.gsap) {
    showLoaderError("Could not load the animation library. Please check your connection and reload.");
    return;
  }
  $("statBooks").textContent = books.length;
  $("statCats").textContent = categories.length;

  setLoader(0.15, "Loading typography…");
  await ensureFonts();

  setLoader(0.4, "Arranging the shelves…");
  const library = new Library({
    grid: $("bookGrid"), filters: $("categoryFilters"), search: $("searchInput"),
    count: $("resultCount"), empty: $("emptyState"), featured: $("featuredGrid"),
    recentWrap: $("recentWrap"), recentRail: $("recentRail"),
    onSelect: (book, el) => reader.open(book, el),
  });

  const reader = new BookReader({
    library,
    toast,
    getHeroOrigin: () => {
      const r = $("heroCanvas").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    onClose: () => {
      library.refresh();
      if (library.category === "Favorites") library.render();
    },
    onFavorite: (book, on) => {
      library.refresh();
      if (library.category === "Favorites") library.render();
      toast(on ? `“${book.title}” added to favorites` : "Removed from favorites");
    },
  });
  library.onFavorite = (id, on) => toast(on ? "Added to favorites" : "Removed from favorites");

  /* hero 3D scene (lazy — falls back gracefully without WebGL / network) */
  setLoader(0.65, "Lighting the scene…");
  let hero = null;
  try {
    const { createHeroScene } = await import("./book3d.js");
    hero = createHeroScene($("heroCanvas"), books, {
      reducedMotion: reduced,
      onPick: (book) => reader.open(book, null),
    });
  } catch (err) {
    console.warn("3D hero unavailable, using the CSS fallback:", err);
    $("heroCanvas").hidden = true;
    const fb = $("heroFallback");
    fb.hidden = false;
    fb.innerHTML = books.slice(0, 3).map((b, i) => `<button type="button" class="fb-book fb-${i}" data-id="${b.id}" aria-label="Open ${b.title}"><div class="shelf-book">${shelfBookHTML(b, { lazy: false })}</div></button>`).join("");
    fb.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-id]"); if (!btn) return;
      reader.open(books.find((b) => b.id === btn.dataset.id), btn.querySelector(".book-3d"));
    });
  }
  // free GPU work while the reader covers the page
  new MutationObserver(() => {
    if (!hero) return;
    document.body.classList.contains("reader-open") ? hero.pause() : hero.resume();
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  /* header / navigation */
  const goLibrary = () => $("library").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  $("exploreBtn").addEventListener("click", goLibrary);
  $("headerExplore").addEventListener("click", goLibrary);
  $("featuredAll").addEventListener("click", () => { library.setCategory("All"); goLibrary(); });

  const menuBtn = $("menuBtn"), nav = $("mobileNav");
  const setMenu = (open) => {
    nav.hidden = !open; menuBtn.setAttribute("aria-expanded", open);
    menuBtn.querySelector("i").className = open ? "icon-x" : "icon-menu";
    document.body.classList.toggle("menu-open", open);
  };
  menuBtn.addEventListener("click", () => setMenu(nav.hidden));
  nav.addEventListener("click", (e) => {
    const a = e.target.closest("a"); if (!a) return;
    if (a.dataset.filter) library.setCategory(a.dataset.filter);
    setMenu(false);
  });
  window.addEventListener("resize", () => { if (window.innerWidth > 900) setMenu(false); });

  /* shortcuts: "/" or Ctrl/⌘+K focuses search */
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if ((e.key === "/" && !typing && reader.state === "closed") || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault(); $("searchInput").focus();
      $("library").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    }
  });

  initDust($("dust"));
  initAnimations();
  hideLoader();

  window.addEventListener("pagehide", () => hero?.dispose());
  window.__app = { library, reader, hero, store };   // handy for debugging in DevTools
}

boot().catch((err) => {
  console.error(err);
  showLoaderError("Something went wrong while starting the library.");
});
