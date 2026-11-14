/* book3d.js — Three.js hero scene.
   A large floating "hero" book surrounded by smaller library books.
   Each book is a real 3D object: front/back boards, spine, and a page block
   with visible page edges. Pausing, resizing and disposal are handled here. */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { getCoverCanvas, drawSpine } from "./covers.js";

const HERO_BOOK = {
  id: "__hero", title: "A World Beyond Pages", author: "Beyond Pages", category: "The Library",
  colors: ["#7c4dff", "#150f38"], accent: "#d4c5ff", motif: "orbit",
};

/* ------------------------------------------------------------ small helpers */
function stripeTexture(vertical) {
  const c = document.createElement("canvas");
  c.width = vertical ? 4 : 128; c.height = vertical ? 128 : 4;
  const g = c.getContext("2d");
  for (let i = 0; i < 128; i++) {
    g.fillStyle = i % 2 ? "#cfc5ae" : "#f3ebd8";
    vertical ? g.fillRect(0, i, 4, 1) : g.fillRect(i, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(inner = "rgba(255,255,255,1)") {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner); grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Build one book standing upright: +z = front cover, -x = spine. */
function makeBook(book, w, h, t, maxAniso, shared) {
  const group = new THREE.Group();
  const ct = t * 0.07; // cover board thickness
  const cover = new THREE.CanvasTexture(getCoverCanvas(book));
  cover.colorSpace = THREE.SRGBColorSpace; cover.anisotropy = maxAniso;
  const spine = new THREE.CanvasTexture(drawSpine(book));
  spine.colorSpace = THREE.SRGBColorSpace; spine.anisotropy = maxAniso;

  const board = new THREE.MeshStandardMaterial({ color: new THREE.Color(book.colors[1]).multiplyScalar(0.9), roughness: 0.62, metalness: 0.05 });
  const back = new THREE.MeshStandardMaterial({ color: new THREE.Color(book.colors[0]).multiplyScalar(0.55), roughness: 0.65 });
  const front = new THREE.MeshPhysicalMaterial({ map: cover, roughness: 0.45, metalness: 0.02, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const spineMat = new THREE.MeshStandardMaterial({ map: spine, roughness: 0.55 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xf0e8d4, roughness: 0.95 });
  const foreEdge = new THREE.MeshStandardMaterial({ map: shared.edgeH, roughness: 0.95 });
  const topEdge = new THREE.MeshStandardMaterial({ map: shared.edgeV, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1626, roughness: 0.9 });

  const frontBoard = new THREE.Mesh(new THREE.BoxGeometry(w, h, ct), [board, board, board, board, front, board]);
  frontBoard.position.z = t / 2 - ct / 2;
  const backBoard = new THREE.Mesh(new THREE.BoxGeometry(w, h, ct), [board, board, board, board, board, back]);
  backBoard.position.z = -t / 2 + ct / 2;
  const spineBoard = new THREE.Mesh(new THREE.BoxGeometry(ct * 1.6, h, t), [board, spineMat, board, board, board, board]);
  spineBoard.position.x = -w / 2 + ct * 0.8;
  const pages = new THREE.Mesh(new THREE.BoxGeometry(w * 0.955, h * 0.965, t - ct * 2), [foreEdge, dark, topEdge, topEdge, paper, paper]);
  pages.position.x = w * 0.018;

  group.add(pages, frontBoard, backBoard, spineBoard);
  group.userData.book = book;
  return group;
}

/* --------------------------------------------------------------- main scene */
export function createHeroScene(canvas, books, { onPick, reducedMotion = false } = {}) {
  const small = window.matchMedia("(max-width: 760px)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, alpha: true, powerPreference: "high-performance" });
  const maxDpr = small ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);

  // image-based lighting for believable reflections on the covers
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55; // three r163+

  scene.add(new THREE.HemisphereLight(0xb9b4ff, 0x120f22, 0.7));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(-4, 5, 6); scene.add(key);
  const rim = new THREE.PointLight(0x38bdf8, 28, 18); rim.position.set(5, 1, -2); scene.add(rim);
  const violet = new THREE.PointLight(0x8b5cf6, 32, 18); violet.position.set(-5, -2, 3); scene.add(violet);

  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const shared = { edgeH: stripeTexture(false), edgeV: stripeTexture(true) };
  shared.edgeH.anisotropy = shared.edgeV.anisotropy = maxAniso;

  const world = new THREE.Group(); scene.add(world);

  // hero book
  const hero = makeBook(HERO_BOOK, 2.1, 2.9, 0.62, maxAniso, shared);
  const heroPivot = new THREE.Group(); heroPivot.add(hero); world.add(heroPivot);

  // satellite books
  const slots = [
    [-2.9, 1.55, -1.1, 0.5], [2.95, 1.25, -0.8, -0.55], [-2.7, -1.7, 0.1, 0.45],
    [2.8, -1.75, -0.2, -0.4], [0.2, 2.45, -2.3, 0.2], [-0.2, -2.55, -1.6, -0.25],
    [4.1, -0.1, -2.6, -0.5], [-4.1, 0.0, -2.4, 0.55],
  ];
  const count = small ? 5 : Math.min(slots.length, Math.max(books.length, 6));
  const sats = [];
  for (let i = 0; i < count; i++) {
    const book = books[i % books.length];
    const g = makeBook(book, 0.82, 1.14, 0.2 + (i % 3) * 0.04, maxAniso, shared);
    const pivot = new THREE.Group(); pivot.add(g);
    const [x, y, z, ry] = slots[i];
    pivot.position.set(x, y, z);
    pivot.userData = { base: new THREE.Vector3(x, y, z), ry, phase: Math.random() * 6.28, speed: 0.6 + Math.random() * 0.5, book, scale: 1, target: 1, group: g };
    world.add(pivot); sats.push(pivot);
  }

  // soft contact shadow under the hero book
  const shadowTex = glowTexture("rgba(0,0,0,0.9)");
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.3),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -2.55; world.add(shadow);

  // ambient dust
  const dustCount = small ? 70 : 150;
  const pos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) { pos[i * 3] = (Math.random() - 0.5) * 12; pos[i * 3 + 1] = (Math.random() - 0.5) * 8; pos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dustTex = glowTexture();
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: dustTex, size: 0.09, color: 0xc4b5fd, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  /* -------------------------------------------------------------- sizing */
  let width = 1, height = 1;
  function resize() {
    width = canvas.clientWidth || 600; height = canvas.clientHeight || 600;
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    const halfH = Math.max(3.5, 3.3 / camera.aspect);
    camera.position.set(0, 0, halfH / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const xs = THREE.MathUtils.clamp(camera.aspect * 0.95, 0.62, 1.2);
    sats.forEach((s) => s.position.x = s.userData.base.x * xs);
    requestRender();
  }

  /* ------------------------------------------------------------ pointer */
  const pointer = { x: 0, y: 0, inside: false, cx: 0, cy: 0, dirty: false };
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  let hovered = null;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    pointer.cx = e.clientX; pointer.cy = e.clientY; pointer.inside = true; pointer.dirty = true;
    requestRender();
  };
  const onLeave = () => { pointer.inside = false; pointer.x = pointer.y = 0; setHover(null); requestRender(); };
  function setHover(s) {
    if (hovered === s) return;
    hovered = s;
    canvas.style.cursor = s ? "pointer" : "";
    sats.forEach((p) => (p.userData.target = p === s ? 1.16 : 1));
  }
  function pick() {
    const r = canvas.getBoundingClientRect();
    ndc.set(((pointer.cx - r.left) / r.width) * 2 - 1, -((pointer.cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(sats, true);
    if (!hits.length) return null;
    let o = hits[0].object; while (o && !sats.includes(o)) o = o.parent;
    return o || null;
  }
  const onClick = (e) => {
    pointer.cx = e.clientX; pointer.cy = e.clientY;
    const hit = pick();
    if (hit) onPick?.(hit.userData.book, canvas);
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);

  /* ---------------------------------------------------------- render loop */
  let raf = 0, running = false, onScreen = true, disposed = false, queued = false;
  const clock = new THREE.Clock();
  let elapsed = 0;
  const lerp = THREE.MathUtils.lerp;

  function update(dt) {
    elapsed += dt;
    const t = elapsed;
    if (pointer.dirty) { setHover(pick()); pointer.dirty = false; }
    world.rotation.y = lerp(world.rotation.y, pointer.x * 0.18, 0.05);
    world.rotation.x = lerp(world.rotation.x, pointer.y * 0.08, 0.05);
    camera.position.x = lerp(camera.position.x, pointer.x * 0.35, 0.04);
    camera.position.y = lerp(camera.position.y, -pointer.y * 0.25, 0.04);
    camera.lookAt(0, 0, 0);

    heroPivot.position.y = Math.sin(t * 0.9) * 0.14;
    heroPivot.rotation.y = 0.5 + Math.sin(t * 0.45) * 0.4;
    heroPivot.rotation.x = -0.08 + Math.sin(t * 0.6) * 0.04;
    heroPivot.rotation.z = Math.sin(t * 0.5) * 0.03;
    const s = 1 - (heroPivot.position.y + 0.14) * 0.1;
    shadow.scale.set(s, s, s);

    for (const p of sats) {
      const u = p.userData;
      p.position.y = u.base.y + Math.sin(t * u.speed + u.phase) * 0.16;
      u.scale = lerp(u.scale, u.target, 0.12); p.scale.setScalar(u.scale);
      u.group.rotation.y = u.ry + Math.sin(t * 0.5 * u.speed + u.phase) * 0.28;
      u.group.rotation.x = Math.sin(t * 0.4 + u.phase) * 0.1;
      u.group.rotation.z = u.ry * 0.12;
    }
    dust.rotation.y = t * 0.02; dust.position.y = Math.sin(t * 0.2) * 0.1;
  }

  function frame() {
    raf = 0;
    if (disposed) return;
    update(Math.min(clock.getDelta(), 0.05));
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }
  function start() { if (running || disposed || reducedMotion) return; running = true; clock.getDelta(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function requestRender() {
    if (running || queued || disposed) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (!disposed) { update(0.016); renderer.render(scene, camera); } });
  }
  const sync = () => (onScreen && !document.hidden ? start() : stop());

  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }, { threshold: 0.01 });
  io.observe(canvas);
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  document.addEventListener("visibilitychange", sync);

  resize();
  if (reducedMotion) { heroPivot.rotation.y = 0.45; requestRender(); } else sync();

  return {
    pause: stop,
    resume: sync,
    dispose() {
      disposed = true; stop();
      io.disconnect(); ro.disconnect();
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      scene.traverse((o) => {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
      });
      shared.edgeH.dispose(); shared.edgeV.dispose(); shadowTex.dispose(); dustTex.dispose();
      envTex.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
}
