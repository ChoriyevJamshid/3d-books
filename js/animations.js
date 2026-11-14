/* animations.js — loader, ambient dust, scroll reveals, hero intro, smooth anchors. */

const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function setLoader(progress, message) {
  const bar = document.getElementById("loaderBar");
  if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
  if (message) { const m = document.getElementById("loaderMsg"); if (m) m.textContent = message; }
}

export function hideLoader() {
  const loader = document.getElementById("loader");
  if (!loader) return;
  setLoader(1, "Welcome");
  const remove = () => { loader.remove(); document.body.classList.add("is-ready"); };
  if (window.gsap && !prefersReduced()) {
    gsap.to(loader, { opacity: 0, duration: 0.7, delay: 0.25, ease: "power2.inOut", onComplete: remove });
  } else { loader.classList.add("done"); setTimeout(remove, 200); }
}

export function showLoaderError(message) {
  const loader = document.getElementById("loader");
  if (!loader) return;
  loader.classList.add("error");
  setLoader(1, message);
}

/** Subtle drifting dust on a single lightweight 2D canvas (paused when hidden). */
export function initDust(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, parts = [], raf = 0;
  const reduced = prefersReduced();

  function resize() {
    w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight;
    const n = Math.round(Math.min(70, (w * h) / 26000));
    parts = Array.from({ length: n }, () => spawn(true));
    if (reduced) draw();
  }
  function spawn(initial) {
    return { x: Math.random() * w, y: initial ? Math.random() * h : h + 10, r: 0.5 + Math.random() * 1.5, v: 0.08 + Math.random() * 0.22, a: 0.12 + Math.random() * 0.35, d: Math.random() * 6.28, hue: Math.random() < 0.3 ? "139,92,246" : "180,200,255" };
  }
  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      ctx.beginPath(); ctx.fillStyle = `rgba(${p.hue},${p.a})`; ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
  }
  function tick() {
    for (const p of parts) {
      p.y -= p.v; p.d += 0.004; p.x += Math.sin(p.d) * 0.18;
      if (p.y < -10) Object.assign(p, spawn(false), { x: Math.random() * w });
    }
    draw();
    raf = requestAnimationFrame(tick);
  }
  const sync = () => {
    cancelAnimationFrame(raf);
    if (!reduced && !document.hidden && !document.body.classList.contains("reader-open")) raf = requestAnimationFrame(tick);
  };
  resize();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", sync);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  sync();
}

export function initAnimations() {
  const reduced = prefersReduced();
  const g = window.gsap;

  // header state
  const header = document.getElementById("siteHeader");
  const onScroll = () => header?.classList.toggle("scrolled", window.scrollY > 24);
  onScroll(); window.addEventListener("scroll", onScroll, { passive: true });

  // smooth in-page navigation (CSS scroll-margin accounts for the fixed header)
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      const target = id.length > 1 ? document.querySelector(id) : document.body;
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", id);
    });
  });

  if (!g || reduced) { document.querySelectorAll("[data-reveal]").forEach((el) => (el.style.opacity = 1)); return; }

  // hero intro
  g.timeline({ defaults: { ease: "power3.out" } })
    .from(".hero .eyebrow", { y: 20, opacity: 0, duration: 0.7 }, 0.2)
    .from(".hero h1", { y: 50, opacity: 0, duration: 1 }, 0.3)
    .from(".hero-sub", { y: 24, opacity: 0, duration: 0.8 }, 0.55)
    .from(".hero-actions > *", { y: 20, opacity: 0, duration: 0.7, stagger: 0.1 }, 0.7)
    .from(".hero-stats li", { y: 16, opacity: 0, duration: 0.6, stagger: 0.08 }, 0.9)
    .from(".hero-stage", { scale: 0.92, opacity: 0, duration: 1.4 }, 0.2);

  // scroll reveals
  if (window.ScrollTrigger) {
    g.registerPlugin(ScrollTrigger);
    g.utils.toArray("[data-reveal]").forEach((el) => {
      g.from(el, { y: 36, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } });
    });
    g.utils.toArray(".featured-grid .book-card").forEach((el) => {
      g.from(el, { y: 50, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 92%", once: true } });
    });
    g.to(".about-book", { rotationY: -24, rotationX: 8, ease: "none", scrollTrigger: { trigger: ".about", start: "top bottom", end: "bottom top", scrub: 0.6 } });
    g.to(".hero-copy", { y: -60, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  } else {
    document.querySelectorAll("[data-reveal]").forEach((el) => (el.style.opacity = 1));
  }
}
