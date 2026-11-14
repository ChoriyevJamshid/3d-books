# Beyond Pages — Immersive 3D Digital Library

A premium, framework-free digital library. Pick a book off the shelf, watch it lift and fly to the centre of the screen, open the cover and read it page by page — with real page-bending page turns.

Built with HTML5, CSS3, vanilla ES-module JavaScript, **Three.js** (hero scene), **GSAP** (all motion), Google Fonts and Lucide icons. No build step, no backend.

## Run locally

ES modules and import maps need `http://`, so serve the folder (opening `index.html` via `file://` will not work):

```bash
# Python (any OS)
python -m http.server 8000

# or Node
npx serve .
```

Open **http://localhost:8000**. An internet connection is required for the CDN libraries (Three.js, GSAP, Lucide) and Google Fonts. If a CDN is unreachable the app degrades gracefully: without Three.js the hero uses CSS 3D books; without GSAP a clear error is shown on the loading screen.

## What you can do

| Area | Features |
| --- | --- |
| **Hero** | Large floating Three.js book + satellite books (each a real 3D object: boards, spine, page edges), mouse parallax, hover/click on the small books, cinematic lighting & image-based reflections, dust particles |
| **Library** | CSS-3D books with spine + page edges; hover lifts & rotates, books follow the cursor; category filters, live search (title / author / category), favorites filter, *Recently opened* rail, reading-progress bars |
| **Pick-up flow** | Click a book → it lifts and flies to the centre → details panel (title, author, description, category, pages, year, reading time, bookmarks) → **Read Book** |
| **3D reader** | Cover opens on its spine, two-page spread with thickness that shifts as you read, pages **bend** while turning (16 strips, per-strip shading, cast shadows), folded-corner hint, bookmark ribbons, "The End" page, closing animation back to the shelf |
| **Controls** | Click right/left page · ← → · PageUp/PageDown · Home / End · swipe on touch · Prev/Next buttons · `B` bookmark · `Esc` close · `/` or `Ctrl/⌘ K` focus search |
| **Persistence** | Last page per book, furthest page read, bookmarks, favorites and recents are saved in `localStorage` |
| **Responsive** | Desktop/laptop/tablet: two-page spread. Phones (<760 px): single-page reader with swipe; details panel becomes a bottom sheet; no horizontal overflow |
| **Quality** | Render loops pause off-screen / in background tabs / while the reader is open; reduced-motion support (instant page changes, no flights); covers are generated lazily; Three.js resources are disposed on page hide; loading and error states |

## Project structure

```text
index.html
css/
  style.css        design tokens, layout, hero, library, shelf books
  reader.css       reader stage, bending flipper, page typography, details panel
  animations.css   keyframes, loader, reduced-motion
  responsive.css   tablet / mobile
js/
  main.js          bootstraps and wires the modules
  library.js       shelf rendering, search, filters, featured, recents, favorites
  book3d.js        Three.js hero scene (lazy-imported)
  covers.js        procedural cover art (canvas) shared by CSS and Three.js
  bookReader.js    3D reader: fly-in, open, page turns, close
  animations.js    loader, dust canvas, scroll reveals, smooth anchors
  storage.js       localStorage store (favorites, progress, bookmarks, recents)
  data.js          book catalogue with original sample text + SVG illustrations
assets/            reserved for custom images / textures / fonts
```

## How the page turn works

`bookReader.js` models a book as a list of *faces* (cover, endpaper, pages…, colophon). In two-page mode a leaf holds two faces. On a turn, the leaf is rebuilt as a chain of nested strips (`.st`), each rotated relative to its parent — `rotateY(base)` for the first strip and a small `rotateY(bend)` for the rest. A single GSAP tween drives progress `p`; the bend follows `sin(2πp)` so the free edge lags behind and then leads, like paper. Shading opacity per strip follows the strip's angle, and gradient overlays on the pages beneath cast the leaf's shadow. Content is real DOM text, so it stays crisp and selectable at any size; page text uses container-query units and is auto-fitted so nothing overflows.

## Adding books

Append an entry to `books` in `js/data.js` (`id`, `title`, `author`, `category`, `year`, `colors`, `accent`, `motif`, `content: [ch(…), tx(…), fg(…), qt(…)]`). Covers, spines, the shelf, the hero and the reader pick it up automatically. Available cover motifs: `map`, `stars`, `orbit`, `waves`, `code`, `frames`, `strata`, `chart`, `sun`.

Sample texts are original works written for this demo.
