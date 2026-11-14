/* covers.js — procedural cover art.
   One canvas drawing is reused for: the CSS shelf books, the reader's cover,
   and the Three.js hero books (as textures). No image assets needed. */

export const COVER_W = 480;
export const COVER_H = 640;

const SERIF = '"Playfair Display", Georgia, serif';
const SANS = '"DM Sans", system-ui, sans-serif';

/** Wait (with a timeout) for the web fonts so canvas text uses them. */
export async function ensureFonts(timeout = 2500) {
  if (!document.fonts?.load) return;
  const load = Promise.all([
    document.fonts.load(`700 40px ${SERIF}`),
    document.fonts.load(`500 40px ${SERIF}`),
    document.fonts.load(`500 14px ${SANS}`),
    document.fonts.load(`700 14px ${SANS}`),
  ]).catch(() => {});
  await Promise.race([load, new Promise((r) => setTimeout(r, timeout))]);
}

const hexToRgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function spaced(ctx, text, x, y, spacing) {
  if ("letterSpacing" in ctx) {
    ctx.letterSpacing = `${spacing}px`;
    // letterSpacing adds trailing space; nudge to keep the text visually centred
    ctx.fillText(text, x + spacing / 2, y);
    ctx.letterSpacing = "0px";
  } else {
    ctx.fillText(text, x, y);
  }
}

function wrap(ctx, text, maxW) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/* ---------------------------------------------------------------- motifs */
const motifs = {
  map(c, cx, cy, s) {
    for (let i = 1; i <= 6; i++) {
      c.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.1) {
        const r = i * 20 * s * (1 + 0.12 * Math.sin(a * 3 + i) + 0.07 * Math.cos(a * 5 - i));
        const x = cx + Math.cos(a) * r * 1.4, y = cy + Math.sin(a) * r * 0.9;
        a === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.globalAlpha = 0.25 + i * 0.07; c.stroke();
    }
    c.globalAlpha = 1; c.setLineDash([6, 8]);
    c.beginPath(); c.moveTo(cx - 120 * s, cy + 70 * s); c.bezierCurveTo(cx - 40 * s, cy - 10 * s, cx + 20 * s, cy + 50 * s, cx + 110 * s, cy - 60 * s); c.stroke();
    c.setLineDash([]); c.beginPath(); c.arc(cx + 110 * s, cy - 60 * s, 6, 0, 7); c.fill();
  },
  stars(c, cx, cy, s) {
    const pts = [[-110, 50], [-60, -20], [-10, 20], [50, -50], [110, -5], [85, 55]];
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(cx + x * s, cy + y * s) : c.moveTo(cx + x * s, cy + y * s)));
    c.globalAlpha = 0.5; c.stroke(); c.globalAlpha = 1;
    pts.forEach(([x, y], i) => { c.beginPath(); c.arc(cx + x * s, cy + y * s, 4 + (i % 3) * 2, 0, 7); c.fill(); });
    for (let i = 0; i < 26; i++) { c.globalAlpha = 0.3 + (i % 5) * 0.1; c.fillRect(cx + Math.sin(i * 12.9) * 150 * s, cy + Math.cos(i * 7.7) * 90 * s, 2, 2); }
    c.globalAlpha = 1;
  },
  orbit(c, cx, cy, s) {
    [30, 62, 96].forEach((r, i) => { c.globalAlpha = 0.5 - i * 0.1; c.beginPath(); c.ellipse(cx, cy, r * s * 1.5, r * s * 0.8, -0.25, 0, 7); c.stroke(); });
    c.globalAlpha = 1; c.beginPath(); c.arc(cx, cy, 14 * s, 0, 7); c.fill();
    [[0.6, 62], [2.7, 96], [4.4, 30], [5.5, 96]].forEach(([a, r]) => {
      const x = cx + Math.cos(a) * r * s * 1.5 * Math.cos(-0.25) - Math.sin(a) * r * s * 0.8 * Math.sin(-0.25);
      const y = cy + Math.cos(a) * r * s * 1.5 * Math.sin(-0.25) + Math.sin(a) * r * s * 0.8 * Math.cos(-0.25);
      c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill();
    });
  },
  waves(c, cx, cy, s) {
    for (let r = 0; r < 6; r++) {
      c.globalAlpha = 0.85 - r * 0.13; c.beginPath();
      for (let x = -150; x <= 150; x += 6) {
        const y = cy - 60 * s + r * 24 * s + Math.sin(x * 0.045 + r) * 9 * s;
        x === -150 ? c.moveTo(cx + x * s, y) : c.lineTo(cx + x * s, y);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
    [[60, 30, 5], [85, 55, 3], [45, 62, 2.5]].forEach(([x, y, r]) => { c.beginPath(); c.arc(cx + x * s, cy + y * s, r, 0, 7); c.fill(); });
  },
  code(c, cx, cy, s) {
    c.lineWidth = 5; c.beginPath();
    c.moveTo(cx - 40 * s, cy - 55 * s); c.lineTo(cx - 95 * s, cy); c.lineTo(cx - 40 * s, cy + 55 * s);
    c.moveTo(cx + 40 * s, cy - 55 * s); c.lineTo(cx + 95 * s, cy); c.lineTo(cx + 40 * s, cy + 55 * s);
    c.stroke(); c.lineWidth = 3; c.globalAlpha = 0.6; c.beginPath(); c.moveTo(cx + 14 * s, cy - 62 * s); c.lineTo(cx - 14 * s, cy + 62 * s); c.stroke(); c.globalAlpha = 1;
  },
  frames(c, cx, cy, s) {
    [[-60, -30, 0.35], [-20, 0, 0.6], [20, 30, 1]].forEach(([dx, dy, a]) => { c.globalAlpha = a; c.strokeRect(cx + (dx - 80) * s, cy + (dy - 45) * s, 160 * s, 90 * s); });
    c.globalAlpha = 1; c.beginPath(); c.arc(cx - 45 * s, cy - 8 * s, 6, 0, 7); c.fill();
    c.globalAlpha = 0.6; c.beginPath(); c.moveTo(cx - 25 * s, cy - 8 * s); c.lineTo(cx + 80 * s, cy - 8 * s); c.moveTo(cx - 55 * s, cy + 18 * s); c.lineTo(cx + 60 * s, cy + 18 * s); c.stroke(); c.globalAlpha = 1;
  },
  strata(c, cx, cy, s) {
    for (let r = 0; r < 6; r++) {
      c.globalAlpha = 0.9 - r * 0.13; c.beginPath();
      for (let x = -150; x <= 150; x += 6) {
        const y = cy - 66 * s + r * 24 * s + Math.sin(x * 0.02 + r * 1.3) * 12 * s;
        x === -150 ? c.moveTo(cx + x * s, y) : c.lineTo(cx + x * s, y);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  },
  chart(c, cx, cy, s) {
    c.globalAlpha = 0.5; c.beginPath(); c.moveTo(cx - 130 * s, cy + 70 * s); c.lineTo(cx + 130 * s, cy + 70 * s); c.moveTo(cx - 130 * s, cy + 70 * s); c.lineTo(cx - 130 * s, cy - 80 * s); c.stroke();
    c.globalAlpha = 0.35;
    for (let i = 0; i < 6; i++) { const h = (i + 1) * 20 * s; c.fillRect(cx - 100 * s + i * 40 * s, cy + 70 * s - h, 22 * s, h); }
    c.globalAlpha = 1; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 120 * s, cy + 60 * s); c.bezierCurveTo(cx - 20 * s, cy + 50 * s, cx + 30 * s, cy, cx + 120 * s, cy - 70 * s); c.stroke();
    c.beginPath(); c.arc(cx + 120 * s, cy - 70 * s, 7, 0, 7); c.fill();
  },
  sun(c, cx, cy, s) {
    c.beginPath(); c.arc(cx, cy + 40 * s, 52 * s, Math.PI, 0); c.stroke();
    c.globalAlpha = 0.7;
    for (let i = 0; i < 9; i++) { const a = Math.PI + (i + 0.5) * (Math.PI / 9); c.beginPath(); c.moveTo(cx + Math.cos(a) * 68 * s, cy + 40 * s + Math.sin(a) * 68 * s); c.lineTo(cx + Math.cos(a) * 92 * s, cy + 40 * s + Math.sin(a) * 92 * s); c.stroke(); }
    c.globalAlpha = 0.5; [0, 20, 40].forEach((d, i) => { c.globalAlpha = 0.6 - i * 0.18; c.beginPath(); c.moveTo(cx - (140 - i * 25) * s, cy + (50 + d) * s); c.lineTo(cx + (140 - i * 25) * s, cy + (50 + d) * s); c.stroke(); });
    c.globalAlpha = 1;
  },
};

/* ----------------------------------------------------------------- cover */
export function drawCover(book, w = COVER_W, h = COVER_H) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext("2d");
  const k = w / COVER_W;
  c.scale(k, k);
  const W = COVER_W, H = COVER_H;
  const [c0, c1] = book.colors;
  const accent = book.accent;

  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, c0); bg.addColorStop(1, c1);
  c.fillStyle = bg; c.fillRect(0, 0, W, H);

  const glow = c.createRadialGradient(W * 0.78, H * 0.18, 0, W * 0.78, H * 0.18, W * 0.8);
  glow.addColorStop(0, hexToRgba(accent, 0.28)); glow.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = glow; c.fillRect(0, 0, W, H);

  // vignette + faint cloth grain
  const vg = c.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, H * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.4)");
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  c.fillStyle = "rgba(255,255,255,0.025)";
  for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);

  c.strokeStyle = hexToRgba(accent, 0.5); c.lineWidth = 1.5; c.strokeRect(22, 22, W - 44, H - 44);
  c.strokeStyle = hexToRgba(accent, 0.2); c.lineWidth = 1; c.strokeRect(30, 30, W - 60, H - 60);

  c.textAlign = "center"; c.textBaseline = "alphabetic";
  c.fillStyle = hexToRgba(accent, 0.8); c.font = `700 12px ${SANS}`;
  spaced(c, book.category.toUpperCase(), W / 2, 70, 4);

  c.strokeStyle = accent; c.fillStyle = accent; c.lineWidth = 2; c.lineCap = "round"; c.lineJoin = "round";
  c.save(); (motifs[book.motif] || motifs.orbit)(c, W / 2, 222, 1); c.restore();

  c.fillStyle = "#fbf7ee"; c.font = `700 44px ${SERIF}`;
  let lines = wrap(c, book.title, W - 110);
  if (lines.length > 3) { c.font = `700 36px ${SERIF}`; lines = wrap(c, book.title, W - 100); }
  const lh = 52;
  let y = 400 + (3 - Math.min(3, lines.length)) * 10;
  for (const ln of lines) { c.fillText(ln, W / 2, y); y += lh; }

  c.fillStyle = hexToRgba(accent, 0.9); c.fillRect(W / 2 - 22, y - 24, 44, 2);
  c.fillStyle = "rgba(255,255,255,0.82)"; c.font = `500 14px ${SANS}`;
  spaced(c, book.author.toUpperCase(), W / 2, Math.max(y + 12, 560), 4);
  c.fillStyle = "rgba(255,255,255,0.35)"; c.font = `700 9px ${SANS}`;
  spaced(c, "BEYOND PAGES", W / 2, 604, 5);
  return canvas;
}

/** Spine texture for the Three.js books (title running top → bottom). */
export function drawSpine(book, w = 96, h = 640) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext("2d");
  const g = c.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, book.colors[1]); g.addColorStop(0.5, book.colors[0]); g.addColorStop(1, book.colors[1]);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = hexToRgba(book.accent, 0.6); c.lineWidth = 2;
  [30, h - 30].forEach((y) => { c.beginPath(); c.moveTo(8, y); c.lineTo(w - 8, y); c.stroke(); });
  c.save(); c.translate(w / 2, h / 2); c.rotate(Math.PI / 2);
  c.fillStyle = "#fbf7ee"; c.textAlign = "center"; c.textBaseline = "middle";
  c.font = `700 ${Math.round(w * 0.36)}px ${SERIF}`;
  let t = book.title; while (c.measureText(t).width > h - 150 && t.length > 4) t = t.slice(0, -2);
  c.fillText(t === book.title ? t : `${t}…`, 0, 0);
  c.restore();
  return canvas;
}

/* --------------------------------------------------------------- caching */
const canvasCache = new Map();
const urlCache = new Map();

export function getCoverCanvas(book) {
  if (!canvasCache.has(book.id)) canvasCache.set(book.id, drawCover(book));
  return canvasCache.get(book.id);
}

/** Data-URL for CSS use (generated lazily the first time a cover is needed). */
export function getCoverURL(book) {
  if (!urlCache.has(book.id)) urlCache.set(book.id, getCoverCanvas(book).toDataURL("image/jpeg", 0.9));
  return urlCache.get(book.id);
}
