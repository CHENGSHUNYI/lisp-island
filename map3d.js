// 鄭霸的LISP分類島導覽 — 3D 島嶼地圖（Three.js）
// 不支援 WebGL 或載入失敗時，網頁會自動保留 2D 地圖。
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildAnimal, animateAnimal, walkLegs, faceForward } from "./animals.js?v=7";

const App = window.LispApp;
const wrap = document.querySelector(".map-wrap");
const viewBtn = document.querySelector("#viewBtn");
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
// 截圖用：網址加 ?shout=繪圖,標註 可讓指定島的人物一直喊
const FORCE_SHOUT = new Set((new URLSearchParams(location.search).get("shout") || "").split(",").filter(Boolean));
// 手繪動畫風配色：飽和的草綠、清透的海、暖色陽光
const LAND = [0x7fbf4d, 0x8cc63f, 0x6fb24a, 0x9acd5a, 0x78b84f, 0x86c255];
const HORIZON = new THREE.Color(0xe4f1ea);
const OUTLINE = 0x3b3326;

// 卡通著色：三段明暗
const toonRamp = (() => {
  const d = new Uint8Array([95, 170, 255]);
  const t = new THREE.DataTexture(d, d.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
})();
const toonCache = new Map();
function toon(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!toonCache.has(key)) toonCache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: toonRamp, ...extra }));
  return toonCache.get(key);
}
// 描邊（反向外殼）
const outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });
function outline(mesh, k = 1.06) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  o.scale.setScalar(k);
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }
  catch { return false; }
}

// ---------- 小工具 ----------
const rand = (s) => { const x = Math.sin(s) * 43758.5453; return x - Math.floor(x); };
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

function blobShape(r, seed, wobble = 0.13, n = 16, squash = 0.85) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wobble * (Math.sin(a * 2 + seed) * 0.6 + Math.sin(a * 3 + seed * 1.7) * 0.4 + (rand(seed + i) - 0.5) * 0.8);
    pts.push(new THREE.Vector2(Math.cos(a) * r * k, Math.sin(a) * r * k * squash));
  }
  const curve = new THREE.SplineCurve([...pts, pts[0]]);
  return new THREE.Shape(curve.getPoints(n * 4));
}

function flatExtrude(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 1.2, bevelSegments: 2, curveSegments: 6,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

function labelTexture(emoji, name, count) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 300;
  const x = c.getContext("2d");
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = '120px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  x.fillText(emoji, 256, 80);
  x.font = 'bold 66px "Noto Serif TC","Source Han Serif TC","PMingLiU","Noto Sans TC","Microsoft JhengHei",serif';
  x.lineJoin = "round"; x.lineWidth = 14; x.strokeStyle = "rgba(59,51,38,.85)";
  x.strokeText(name, 256, 192); x.fillStyle = "#fffaf0"; x.fillText(name, 256, 192);
  x.font = 'bold 40px "Noto Sans TC","Microsoft JhengHei",sans-serif';
  x.lineWidth = 9; x.strokeText(count, 256, 262); x.fillStyle = "#ffe9a8"; x.fillText(count, 256, 262);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function badgeTexture(n) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "#d1495b"; x.strokeStyle = "#fffaf0"; x.lineWidth = 10;
  x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.fill(); x.stroke();
  x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `bold ${n > 99 ? 46 : 58}px sans-serif`;
  x.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 各島代表人物（原創低多邊形職人） ----------
const CHARS = {
  "圖塊/屬性":   { shirt: 0xd9534f, pants: 0x3b4a6b, hat: "cap", hatColor: 0x9b2c2c, prop: "brick" },
  "繪圖":        { shirt: 0x8e44ad, pants: 0x2c3e50, hat: "beret", hatColor: 0x22223b, prop: "pencil" },
  "標註":        { shirt: 0xf39c12, pants: 0x34495e, hat: "hardhat", hatColor: 0xffffff, prop: "ruler" },
  "面積/數量統計": { shirt: 0x2980b9, pants: 0x2c3e50, hat: "hair", hatColor: 0x3b2a1e, prop: "calc", glasses: true },
  "修改":        { shirt: 0x2e6fbf, pants: 0x2e6fbf, hat: "cap", hatColor: 0xe67e22, prop: "wrench" },
  "文字":        { shirt: 0x16a085, pants: 0x4a3b2f, hat: "beret", hatColor: 0xc0392b, prop: "book" },
  "圖層":        { shirt: 0xecf0f1, pants: 0x2d3436, hat: "hair", hatColor: 0x111111, prop: "plates", tie: 0xc0392b },
  "系統/授權":   { shirt: 0x2c3e50, pants: 0x1e272e, hat: "captain", hatColor: 0x1f2d3d, prop: "key" },
  "圖面管理":    { shirt: 0xb5a06a, pants: 0x6b5b3e, hat: "wide", hatColor: 0xd8c48f, prop: "map" },
  "剖面/結構":   { shirt: 0xff7f27, pants: 0x34495e, hat: "hardhat", hatColor: 0xf1c40f, prop: "beam" },
  "出圖/列印":   { shirt: 0x95a5a6, pants: 0x2f3640, hat: "paper", hatColor: 0xffffff, prop: "roll" },
  "轉檔/匯出入": { shirt: 0x8b5a2b, pants: 0x5d4037, hat: "cap", hatColor: 0x6d4c41, prop: "parcel" },
  "對齊/排列":   { shirt: 0xffffff, pants: 0x1f3a5f, hat: "captain", hatColor: 0xffffff, prop: "flag", tie: 0x1f3a5f },
  "查詢":        { shirt: 0x8d6e4f, pants: 0x4e3b2a, hat: "wide", hatColor: 0x6b5640, prop: "magnifier" },
  "其他":        { shirt: 0x27ae60, pants: 0x6d4c41, hat: "straw", hatColor: 0xe9c46a, prop: "chest" },
  "3D":          { shirt: 0x34495e, pants: 0x2c3e50, hat: "goggles", hatColor: 0x00cec9, prop: "cube" },
};

function mat(color, extra = {}) {
  const { metalness, ...rest } = extra;
  return toon(color, rest);
}
const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
const cyl = (rt, rb, h, c, seg = 8) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c));
const sph = (r, c, ws = 10, hs = 8) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat(c));

function makeProp(type) {
  const g = new THREE.Group();
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); return m; };
  switch (type) {
    case "brick": add(box(0.9, 0.45, 0.45, 0xc0392b)); break;
    case "pencil": {
      const b = add(cyl(0.13, 0.13, 1.6, 0xf1c40f, 6)); b.rotation.x = Math.PI / 2;
      const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.35, 6), mat(0xf5cba7)), 0, 0, 0.97); tip.rotation.x = Math.PI / 2;
      const er = add(cyl(0.13, 0.13, 0.2, 0xff8fa3, 6), 0, 0, -0.9); er.rotation.x = Math.PI / 2;
      break;
    }
    case "ruler": add(box(0.18, 0.05, 1.8, 0xf7d046)); break;
    case "calc": add(box(0.6, 0.12, 0.8, 0x2d3436)); add(box(0.45, 0.02, 0.22, 0x9be7c4), 0, 0.07, -0.22); break;
    case "wrench": {
      add(box(0.14, 0.1, 1.3, 0xb2bec3));
      const head = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 6, 10, Math.PI * 1.5), mat(0xb2bec3)), 0, 0, 0.75);
      head.rotation.x = Math.PI / 2;
      break;
    }
    case "book": add(box(0.75, 0.22, 0.95, 0x1e6091)); add(box(0.7, 0.18, 0.9, 0xffffff), 0.04, 0, 0); break;
    case "plates": [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db].forEach((c, i) => add(box(0.8, 0.07, 0.6, c), 0, i * 0.12, 0)); break;
    case "key": {
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 12), mat(0xf1c40f, { metalness: 0.4 })));
      add(box(0.09, 0.09, 0.9, 0xf1c40f), 0, 0, 0.6); add(box(0.09, 0.22, 0.09, 0xf1c40f), 0, -0.1, 0.95);
      ring.rotation.y = Math.PI / 2;
      break;
    }
    case "map": { const m = add(box(1.2, 0.03, 0.85, 0xf3e5ab)); add(box(0.5, 0.035, 0.3, 0x7fb069), -0.2, 0.01, 0.1); add(box(0.3, 0.035, 0.25, 0x5dade2), 0.3, 0.01, -0.2); m.rotation.x = -0.5; break; }
    case "beam": add(box(0.5, 0.08, 1.6, 0x7f8c8d), 0, 0.22, 0); add(box(0.5, 0.08, 1.6, 0x7f8c8d), 0, -0.22, 0); add(box(0.08, 0.44, 1.6, 0x7f8c8d)); break;
    case "roll": { const r = add(cyl(0.18, 0.18, 1.2, 0xffffff, 10)); r.rotation.z = Math.PI / 2; add(box(0.9, 0.02, 0.6, 0xffffff), 0, -0.2, 0.35); break; }
    case "parcel": add(box(0.8, 0.6, 0.7, 0xc49a6c)); add(box(0.82, 0.08, 0.15, 0xe1c699), 0, 0.27, 0); break;
    case "flag": add(cyl(0.04, 0.04, 2.2, 0x8a5a33, 5), 0, 0.9, 0); add(box(0.04, 0.5, 0.75, 0xe74c3c), 0, 1.75, 0.38); break;
    case "magnifier": {
      const lens = add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 14), mat(0x4e342e)), 0, 0, 0.75);
      add(new THREE.Mesh(new THREE.CircleGeometry(0.28, 14), mat(0xbfe9ff, { transparent: true, opacity: 0.55 })), 0, 0, 0.75).rotation.y = 0;
      lens.rotation.y = 0;
      add(box(0.1, 0.1, 0.6, 0x4e342e), 0, 0, 0.25);
      break;
    }
    case "chest": add(box(0.8, 0.45, 0.55, 0x8d5524)); add(box(0.84, 0.18, 0.59, 0xb07d3a), 0, 0.3, 0); add(box(0.12, 0.14, 0.04, 0xf1c40f), 0, 0.18, 0.29); break;
    case "cube": add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), mat(0x74d7f7, { transparent: true, opacity: 0.8, emissive: 0x0a6f8f }))).rotation.set(0.6, 0.6, 0); break;
  }
  return g;
}

function makeHat(type, color) {
  const g = new THREE.Group();
  const c = mat(color);
  const add = (geo, y, m = c) => { const mesh = new THREE.Mesh(geo, m); mesh.position.y = y; g.add(mesh); return mesh; };
  switch (type) {
    case "cap": add(new THREE.SphereGeometry(0.64, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.05); add(new THREE.BoxGeometry(0.7, 0.06, 0.55), 0.06).position.z = 0.65; break;
    case "hardhat": add(new THREE.SphereGeometry(0.68, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.05); add(new THREE.CylinderGeometry(0.85, 0.85, 0.07, 14), 0.06); add(new THREE.BoxGeometry(0.12, 0.08, 1.2), 0.62); break;
    case "beret": { const b = add(new THREE.SphereGeometry(0.66, 10, 6), 0.28); b.scale.set(1.05, 0.38, 1.05); b.rotation.z = 0.25; add(new THREE.SphereGeometry(0.08, 6, 4), 0.55); break; }
    case "hair": { const h = add(new THREE.SphereGeometry(0.65, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), -0.02); h.rotation.x = -0.25; break; }
    case "captain": add(new THREE.CylinderGeometry(0.66, 0.6, 0.35, 12), 0.2); add(new THREE.BoxGeometry(0.75, 0.05, 0.45), 0.05).position.z = 0.6;
      add(new THREE.BoxGeometry(0.25, 0.15, 0.04), 0.22, mat(0xf1c40f)).position.z = 0.64; break;
    case "wide": add(new THREE.CylinderGeometry(1.05, 1.05, 0.06, 16), 0.05); add(new THREE.CylinderGeometry(0.5, 0.58, 0.45, 12), 0.28); add(new THREE.CylinderGeometry(0.585, 0.585, 0.1, 12), 0.1, mat(0x3e2723)); break;
    case "straw": add(new THREE.CylinderGeometry(1.15, 1.15, 0.05, 16), 0.05); add(new THREE.CylinderGeometry(0.48, 0.55, 0.32, 12), 0.22); add(new THREE.CylinderGeometry(0.56, 0.56, 0.09, 12), 0.1, mat(0xc0392b)); break;
    case "paper": { const p = add(new THREE.ConeGeometry(0.7, 0.75, 4), 0.38); p.rotation.y = Math.PI / 4; p.scale.z = 0.45; break; }
    case "goggles": {
      add(new THREE.TorusGeometry(0.64, 0.06, 6, 20), -0.45, mat(0x2d3436)).rotation.x = Math.PI / 2;
      const lens = add(new THREE.BoxGeometry(0.95, 0.3, 0.2), -0.48, mat(color, { emissive: 0x007f7d }));
      lens.position.z = 0.58;
      add(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), -0.02, mat(0xf5f6fa));
      break;
    }
  }
  return g;
}

function makePerson(cfg) {
  const skin = 0xf5cba7;
  const root = new THREE.Group();
  const fig = new THREE.Group(); root.add(fig);
  const legL = box(0.32, 0.95, 0.36, cfg.pants); legL.position.set(-0.2, 0.48, 0); fig.add(legL);
  const legR = box(0.32, 0.95, 0.36, cfg.pants); legR.position.set(0.2, 0.48, 0); fig.add(legR);
  const shoeL = box(0.34, 0.16, 0.48, 0x2d2d2d); shoeL.position.set(-0.2, 0.08, 0.06); fig.add(shoeL);
  const shoeR = shoeL.clone(); shoeR.position.x = 0.2; fig.add(shoeR);
  const body = cyl(0.5, 0.6, 1.3, cfg.shirt); body.position.y = 1.6; fig.add(body);
  if (cfg.tie) { const tie = box(0.14, 0.7, 0.05, cfg.tie); tie.position.set(0, 1.75, 0.53); tie.rotation.x = -0.08; fig.add(tie); }
  const head = sph(0.6, skin); head.position.y = 2.85; fig.add(head);
  const eyeL = sph(0.075, 0x1e1e1e, 6, 4); eyeL.position.set(-0.2, 2.92, 0.54); fig.add(eyeL);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.2; fig.add(eyeR);
  const mouth = sph(0.11, 0x8b1e1e, 8, 6); mouth.position.set(0, 2.66, 0.55); mouth.scale.set(1, 0.35, 0.5); fig.add(mouth);
  const blushL = sph(0.09, 0xff9aa2, 6, 4); blushL.position.set(-0.36, 2.75, 0.45); blushL.scale.z = 0.4; fig.add(blushL);
  const blushR = blushL.clone(); blushR.position.x = 0.36; fig.add(blushR);
  if (cfg.glasses) {
    for (const x of [-0.2, 0.2]) {
      const g = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 5, 12), mat(0x222222));
      g.position.set(x, 2.92, 0.6); fig.add(g);
    }
  }
  const hat = makeHat(cfg.hat, cfg.hatColor); hat.position.y = 3.15; fig.add(hat);

  const arm = (side) => {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.62, 2.1, 0);
    const a = cyl(0.13, 0.15, 1.0, cfg.shirt, 6); a.position.y = -0.5; pivot.add(a);
    const hand = sph(0.16, skin, 6, 5); hand.position.y = -1.05; pivot.add(hand);
    fig.add(pivot);
    return pivot;
  };
  const armL = arm(-1), armR = arm(1);
  const prop = makeProp(cfg.prop);
  prop.position.set(0, -1.15, 0.1);
  prop.rotation.x = 0.95;          // 抵銷手臂前伸角度，讓道具保持水平
  armL.add(prop);
  armL.rotation.x = -0.95;
  // 手繪感描邊（小零件如眼睛、嘴巴不描）
  const parts = [];
  fig.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingSphere();
    if (o.geometry.boundingSphere.radius > 0.2) parts.push(o);
  });
  parts.forEach((m) => outline(m, 1.08));
  return { root, fig, armL, armR, mouth };
}

function bubbleTexture(line, head = "選我！", colors = {}) {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 260;
  const x = c.getContext("2d");
  x.font = 'bold 54px "Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
  const w = Math.min(620, Math.max(300, x.measureText(line).width + 70, x.measureText(head).width * 1.25 + 70));
  const left = (640 - w) / 2, top = 10, h = 190, r = 34;
  x.beginPath();
  x.moveTo(left + r, top); x.lineTo(left + w - r, top); x.quadraticCurveTo(left + w, top, left + w, top + r);
  x.lineTo(left + w, top + h - r); x.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
  x.lineTo(338, top + h); x.lineTo(300, 252); x.lineTo(302, top + h);
  x.lineTo(left + r, top + h); x.quadraticCurveTo(left, top + h, left, top + h - r);
  x.lineTo(left, top + r); x.quadraticCurveTo(left, top, left + r, top); x.closePath();
  x.fillStyle = "#fffaf0"; x.fill();
  x.lineWidth = 8; x.strokeStyle = colors.stroke || "#6b4f2e"; x.stroke();
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillStyle = colors.accent || "#d1495b"; x.font = (head.length > 5 ? "bold 56px" : "bold 66px") + ' "Noto Serif TC","PMingLiU","Noto Sans TC","Microsoft JhengHei",serif';
  x.fillText(head, 320, top + 62);
  x.fillStyle = "#3b3326"; x.font = 'bold 50px "Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
  x.fillText(line, 320, top + 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// 手繪天空：漸層藍天＋地平線上的大積雲
function skyTexture(sk = {}) {
  const W = 2048, H = 1024, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, H);
  const cs = sk.colors || ["#3a86d0", "#6db4e8", "#b9e0f2", "#" + HORIZON.getHexString()];
  g.addColorStop(0, cs[0]); g.addColorStop(0.28, cs[1]); g.addColorStop(0.44, cs[2]);
  g.addColorStop(0.5, cs[3]); g.addColorStop(1, cs[3]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 暖色陽光暈
  const sun = x.createRadialGradient(W * 0.3, H * 0.42, 10, W * 0.3, H * 0.42, 420);
  sun.addColorStop(0, sk.glow || "rgba(255,244,214,.75)"); sun.addColorStop(1, "rgba(255,244,214,0)");
  x.fillStyle = sun; x.fillRect(0, 0, W, H);
  // 高空薄雲
  x.globalAlpha = 0.35; x.fillStyle = "#ffffff";
  for (let i = 0; i < 18; i++) {
    const cx = rand(i * 3.7) * W, cy = 80 + rand(i * 5.1) * 250, w = 120 + rand(i) * 260;
    x.beginPath(); x.ellipse(cx, cy, w, 6 + rand(i * 2) * 8, 0, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 1;
  // 積雲（底部平、往上堆疊）
  const base = H * 0.5 + 6;
  const cloud = (cx, w, hgt, s) => {
    const puffs = [];
    for (let i = 0; i < 34; i++) {
      const t = rand(s + i * 1.3);
      const py = base - Math.pow(rand(s + i * 2.1), 0.8) * hgt;
      const spread = (1 - (base - py) / hgt * 0.65) * w;
      const px = cx + (t - 0.5) * spread;
      const pr = (0.16 + rand(s + i * 3.3) * 0.16) * w * (1 - (base - py) / hgt * 0.45);
      puffs.push([px, py, pr]);
    }
    for (const dx of [-W, 0, W]) {
      x.save(); x.beginPath(); x.rect(0, 0, W, base); x.clip();
      for (const [px, py, pr] of puffs) { x.fillStyle = "#c3cbe3"; x.beginPath(); x.arc(px + dx + pr * 0.12, py + pr * 0.16, pr, 0, 6.29); x.fill(); }
      for (const [px, py, pr] of puffs) { x.fillStyle = "#f7f9ff"; x.beginPath(); x.arc(px + dx - pr * 0.06, py - pr * 0.05, pr * 0.9, 0, 6.29); x.fill(); }
      for (const [px, py, pr] of puffs) { x.fillStyle = "rgba(255,246,222,.9)"; x.beginPath(); x.arc(px + dx - pr * 0.25, py - pr * 0.28, pr * 0.45, 0, 6.29); x.fill(); }
      x.restore();
    }
  };
  for (let i = 0; i < 9; i++) cloud(rand(i * 9.1) * W, 160 + rand(i * 4.4) * 260, 120 + rand(i * 6.6) * 230, i * 17.3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

function softDot() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.4, "rgba(255,255,255,.8)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------- 各情境的 3D 設定 ----------
const THEME3D = {
  ghibli: {
    sky: { colors: ["#3a86d0", "#6db4e8", "#b9e0f2", "#e4f1ea"] }, horizon: 0xe4f1ea, ground: "water",
    water: { deep: 0x1d7f95, shallow: 0x4fc0bd, sky: 0xbfe3f0, far: 0x3aa6ad, ring: 0x9ee6dc, shadow: 0x0b4a5a },
    land: LAND, sand: 0xf3e2b3, cliff: 0xc9a878, hill: 0x5e9f3c, rock: 0xa79f92,
    hemi: [0xcfe9ff, 0x9a8a5c, 1.1], sun: [0xfff0cc, 2.1], fluff: 0xfffbe8, fluffN: 160, bob: 1,
    bubble: { stroke: "#6b4f2e", accent: "#d1495b" },
  },
  jungle: {
    sky: { colors: ["#3f86ad", "#76b2c4", "#bcd9c2", "#d0e3c3"], glow: "rgba(255,240,190,.6)" }, horizon: 0xd0e3c3, ground: "water",
    water: { deep: 0x2c6450, shallow: 0x5c9a68, sky: 0xb7d6ae, far: 0x3b7258, ring: 0x8fc48f, shadow: 0x0f3a2a, amp: 0.5 },
    land: [0x3f8a35, 0x2f7a34, 0x4f9a3a, 0x357f3a], sand: 0x8a7a52, cliff: 0x6b5a3a, hill: 0x2f6a2a, rock: 0x7f8a72,
    hemi: [0xd8f0c8, 0x4a5a2a, 1.0], sun: [0xfff0c0, 1.85], fluff: 0xeaffb0, fluffN: 120, bob: 0.12,
    bubble: { stroke: "#2d6a4f", accent: "#e76f51" },
  },
  ocean: {
    sky: { colors: ["#1b78d0", "#4cacec", "#a6daf4", "#e0f4fb"], glow: "rgba(255,250,230,.7)" }, horizon: 0xe0f4fb, ground: "water",
    water: { deep: 0x0a7fb0, shallow: 0x3fcfd6, sky: 0xbfeaf8, far: 0x1f9fc8, ring: 0xa8f4ea, shadow: 0x05506e },
    land: [0x7fc85a, 0x8cd36a, 0x76bf55], sand: 0xfff1c9, cliff: 0xd9c49a, hill: 0x6fbf4a, rock: 0xb8b0a0, sandWide: true,
    hemi: [0xd0f0ff, 0x9ab07c, 1.15], sun: [0xfff6e0, 2.2], fluff: 0xffffff, fluffN: 30, bob: 1,
    bubble: { stroke: "#0077b6", accent: "#ef476f" },
  },
  zoo: {
    sky: { colors: ["#4a9be0", "#7fc0ee", "#c4e6f2", "#eef3dc"] }, horizon: 0xeef3dc, ground: "land",
    plain: { c1: 0x8cc65a, c2: 0x78b14a, ring: 0xe8d3a3, far: 0x86c056, pond: 0x5fb8c8, shadow: 0x2f5a1a },
    land: [0x9ad46a, 0x8cc65a, 0xa3d977], sand: 0xd9c08a, cliff: 0xb9a27a, hill: 0x6faa45, rock: 0xb0a898,
    hemi: [0xdff2ff, 0x8a9a5a, 1.1], sun: [0xfff4d6, 2.1], fluff: 0xffffff, fluffN: 0, bob: 0, raise: 0.4,
    bubble: { stroke: "#b5651d", accent: "#f77f00" },
  },
  safari: {
    sky: { colors: ["#3d7fc4", "#86b5d6", "#f0c98c", "#f6d59a"], glow: "rgba(255,200,120,.9)" }, horizon: 0xf6d59a, ground: "land",
    plain: { c1: 0xd9b25c, c2: 0xc49a44, ring: 0xc99a5a, far: 0xd6ad58, pond: 0x5f9fb3, shadow: 0x6a4a1a },
    land: [0xc9a24a, 0xbf9840, 0xd1ab55], sand: 0xb8864a, cliff: 0xa0643c, hill: 0xa8823a, rock: 0xa8775a,
    hemi: [0xffe6c0, 0x8a6a3a, 1.05], sun: [0xffd9a0, 2.3], fluff: 0xfff0d0, fluffN: 60, bob: 0, raise: 1.4,
    bubble: { stroke: "#7f5539", accent: "#bc4b1e" },
  },
};
const RX = 92, RZ = 66;   // 群島外圍的環狀路線（動物、火車走這裡）

function textSprite(text, w = 7, color = "#3b3326", bg = "#fffaf0") {
  const c = document.createElement("canvas"); c.width = 320; c.height = 110;
  const x = c.getContext("2d");
  x.fillStyle = bg; x.strokeStyle = color; x.lineWidth = 8;
  x.beginPath(); x.roundRect(6, 6, 308, 98, 22); x.fill(); x.stroke();
  x.fillStyle = color; x.font = 'bold 50px "Noto Sans TC","Microsoft JhengHei",sans-serif';
  x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 160, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, toneMapped: false }));
  s.scale.set(w, w * 110 / 320, 1);
  return s;
}

// ---------- 場景 ----------
function create3D(themeId = "ghibli") {
  const T = THEME3D[themeId] || THEME3D.ghibli;
  const TH = (window.LISP_THEMES && window.LISP_THEMES.themes[themeId]) || {};
  const HOSTS = TH.hosts || null;
  const HZ = new THREE.Color(T.horizon);
  const isWater = T.ground === "water";
  const raise = T.raise || 0;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  canvas.id = "map3d";
  canvas.setAttribute("aria-label", "LISP 分類島嶼 3D 地圖，可拖曳旋轉");
  wrap.insertBefore(canvas, wrap.firstChild);

  const scene = new THREE.Scene();
  scene.background = HZ.clone();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24),
    new THREE.MeshBasicMaterial({ map: skyTexture(T.sky), side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog(HZ, 200, 500);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 3200);
  camera.position.set(0, 130, 120);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.32;
  controls.minDistance = 18;
  controls.maxDistance = 300;
  controls.screenSpacePanning = false;
  controls.autoRotateSpeed = 0.35;

  scene.add(new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]));
  const sun = new THREE.DirectionalLight(T.sun[0], T.sun[1]);
  sun.position.set(-70, 100, 60);
  scene.add(sun);

  const ballGeo = new THREE.IcosahedronGeometry(1, 0);
  const puffGeo = new THREE.IcosahedronGeometry(1, 2);
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.32, 1.8, 6);
  const trunkMat = toon(0x7a5232);
  const leafMats = (themeId === "safari" ? [0x6f8a32, 0x86a03c, 0x9aac4a, 0x5f7a2a]
    : themeId === "jungle" ? [0x2f7a2f, 0x3f9a3a, 0x58b048, 0x1f5f2a]
    : [0x3f8a35, 0x5aa83f, 0x76bb45, 0x2f7334]).map((c) => toon(c));
  const swayers = [];
  const updaters = [];   // 每幀更新的漫遊動物、交通工具

  // ---------- 地面：海或草原 ----------
  let waterMat = null;
  if (isWater) {
    const W = T.water;
    const waterGeo = new THREE.PlaneGeometry(900, 900, 220, 220);
    waterGeo.rotateX(-Math.PI / 2);
    waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uAmp: { value: (REDUCED ? 0.35 : 1) * (W.amp ?? 1) },
        uDeep: { value: new THREE.Color(W.deep) }, uShallow: { value: new THREE.Color(W.shallow) },
        uSky: { value: new THREE.Color(W.sky) }, uSun: { value: sun.position.clone().normalize() },
        uFogColor: { value: HZ.clone() }, uFogNear: { value: 200 }, uFogFar: { value: 500 },
      },
      vertexShader: /* glsl */`
        uniform float uTime, uAmp;
        varying vec3 vN; varying vec3 vW; varying float vH;
        float h(vec2 p){
          return uAmp*(0.32*sin(p.x*0.11+uTime*1.1)+0.26*sin(p.y*0.14+uTime*0.85)
            +0.14*sin((p.x+p.y)*0.31+uTime*1.7)+0.08*sin((p.x-p.y)*0.53+uTime*2.3));
        }
        void main(){
          vec3 p = position; p.y = h(p.xz); vH = p.y;
          float e = 0.6;
          float dx = h(p.xz+vec2(e,0.))-h(p.xz-vec2(e,0.));
          float dz = h(p.xz+vec2(0.,e))-h(p.xz-vec2(0.,e));
          vN = normalize(vec3(-dx, 2.*e, -dz));
          vec4 w = modelMatrix*vec4(p,1.); vW = w.xyz;
          gl_Position = projectionMatrix*viewMatrix*w;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uDeep, uShallow, uSky, uSun, uFogColor; uniform float uFogNear, uFogFar;
        varying vec3 vN; varying vec3 vW; varying float vH;
        void main(){
          vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
          float diff = max(dot(n,uSun),0.);
          float band = smoothstep(.35,.75,diff)*.6 + smoothstep(.85,.95,diff)*.4;
          float fres = pow(1.-max(dot(n,v),0.),3.);
          vec3 col = mix(uDeep, uShallow, .55+.35*band);
          col = mix(col, uSky, fres*.6);
          float spec = pow(max(dot(reflect(-uSun,n),v),0.),220.);
          col += vec3(1.,.98,.9)*step(.75,spec)*.7;
          col += vec3(1.)*smoothstep(.55,.7,vH)*.12;
          float f = smoothstep(uFogNear, uFogFar, length(cameraPosition - vW));
          gl_FragColor = vec4(mix(col, uFogColor, f), 1.);
          #include <colorspace_fragment>
        }`,
    });
    scene.add(new THREE.Mesh(waterGeo, waterMat));
    const farSea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshBasicMaterial({ color: W.far }));
    farSea.rotation.x = -Math.PI / 2; farSea.position.y = -2.5;
    scene.add(farSea);
  } else {
    const P = T.plain;
    const g = new THREE.PlaneGeometry(900, 900, 150, 150);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
    const c1 = new THREE.Color(P.c1), c2 = new THREE.Color(P.c2), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = Math.sin(x * 0.045) * Math.cos(z * 0.06) + Math.sin(x * 0.11 + z * 0.07) * 0.5;
      pos.setY(i, n * 0.25 - 0.3);
      tmp.copy(c1).lerp(c2, THREE.MathUtils.clamp(0.5 + n * 0.4 + Math.sin(x * 0.4) * Math.cos(z * 0.33) * 0.15, 0, 1));
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp })));
    const far = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshBasicMaterial({ color: P.far }));
    far.rotation.x = -Math.PI / 2; far.position.y = -0.8;
    scene.add(far);
  }

  // ---------- 共用造景 ----------
  const sandMat = toon(T.sand), cliffMat = toon(T.cliff), hillMat = toon(T.hill), rockMat = toon(T.rock);

  function tree(rnd) {
    const g = new THREE.Group();
    const t = outline(new THREE.Mesh(trunkGeo, trunkMat), 1.12); t.position.y = 0.9; g.add(t);
    const crown = new THREE.Group(); crown.position.y = 2.4; g.add(crown);
    const n = 3 + Math.floor(rnd * 3);
    for (let i = 0; i < n; i++) {
      const m = outline(new THREE.Mesh(puffGeo, leafMats[(i + Math.floor(rnd * 4)) % 4]), 1.07);
      const a = (i / n) * 6.28 + rnd * 3;
      m.position.set(Math.cos(a) * 0.65, rand(rnd * 30 + i) * 0.8, Math.sin(a) * 0.65);
      m.scale.setScalar(0.85 + rand(rnd * 50 + i) * 0.45);
      crown.add(m);
    }
    const topPuff = outline(new THREE.Mesh(puffGeo, leafMats[2]), 1.07); topPuff.position.y = 0.95; topPuff.scale.setScalar(0.9); crown.add(topPuff);
    g.scale.setScalar(0.7 + rnd * 0.5); g.rotation.y = rnd * 6.28;
    swayers.push({ o: crown, ph: rnd * 6.28, amp: 0.05 });
    return g;
  }
  function cypress(rnd) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(trunkGeo, trunkMat); t.position.y = 0.6; t.scale.set(0.7, 0.6, 0.7); g.add(t);
    const c = outline(new THREE.Mesh(puffGeo, leafMats[3]), 1.07);
    c.position.y = 2.6; c.scale.set(0.75, 2.1, 0.75); g.add(c);
    g.scale.setScalar(0.8 + rnd * 0.4);
    swayers.push({ o: c, ph: rnd * 6.28, amp: 0.035 });
    return g;
  }
  const ROOFS = [0xc8553d, 0x2a7f9e, 0xd98e32, 0x8c4a7a];
  function cottage(rnd) {
    const g = new THREE.Group();
    const wall = outline(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), toon(0xfbf1dc)), 1.05); wall.position.y = 0.8; g.add(wall);
    const roof = outline(new THREE.Mesh(new THREE.ConeGeometry(1.85, 1.4, 4), toon(ROOFS[Math.floor(rnd * 4)])), 1.05);
    roof.position.y = 2.3; roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.85); g.add(roof);
    const chim = outline(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.35), toon(0x9b6b4a)), 1.08); chim.position.set(0.55, 2.6, -0.2); g.add(chim);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.05), toon(0x7a5232)); door.position.set(0, 0.45, 0.91); g.add(door);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.05), toon(0xffd97a, { emissive: 0x664d10 })); win.position.set(-0.65, 1.05, 0.91); g.add(win);
    const win2 = win.clone(); win2.position.x = 0.65; g.add(win2);
    g.rotation.y = rnd * 6.28;
    return g;
  }
  function palm(rnd) {
    const g = new THREE.Group();
    const lean = 0.15 + rnd * 0.2;
    for (let k = 0; k < 4; k++) {
      const seg = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.17 - k * 0.02, 0.2 - k * 0.02, 0.85, 6), toon(k % 2 ? 0x9b7448 : 0x8a6540)), 1.1);
      seg.position.set(Math.sin(lean) * k * 0.8 + lean * k * 0.15, 0.42 + k * 0.8, 0); seg.rotation.z = -lean - k * 0.05; g.add(seg);
    }
    const top = new THREE.Group(); top.position.set(Math.sin(lean) * 3.2 + lean * 0.6, 3.3, 0); g.add(top);
    for (let i = 0; i < 7; i++) {
      const pv = new THREE.Group(); pv.rotation.y = (i / 7) * Math.PI * 2 + rnd; top.add(pv);
      const l = outline(new THREE.Mesh(puffGeo, toon(i % 2 ? 0x3f9a3a : 0x58b048)), 1.06);
      l.scale.set(0.3, 0.07, 1.4); l.position.set(0, -0.35, 1.2); l.rotation.x = 0.45; pv.add(l);
    }
    for (let i = 0; i < 3; i++) { const co = new THREE.Mesh(ballGeo, toon(0x6b4f2e)); co.scale.setScalar(0.22); co.position.set(Math.cos(i * 2.1) * 0.25, -0.2, Math.sin(i * 2.1) * 0.25); top.add(co); }
    g.rotation.y = rnd * 6.28; g.scale.setScalar(0.9 + rnd * 0.3);
    swayers.push({ o: top, ph: rnd * 6.28, amp: 0.06 });
    return g;
  }
  function flowers(body, r, top, seed, colors, count) {
    const n = count ?? Math.round(r * 5);
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshToonMaterial({ gradientMap: toonRamp }), n);
    const m4 = new THREE.Matrix4(), cs = colors.map((c) => new THREE.Color(c));
    for (let f = 0; f < n; f++) {
      const a = rand(seed * 3 + f * 1.7) * 6.28, rr = r * 0.75 * Math.sqrt(rand(seed + f * 2.3));
      m4.makeTranslation(Math.cos(a) * rr, top + 0.05, Math.sin(a) * rr * 0.8);
      im.setMatrixAt(f, m4); im.setColorAt(f, cs[Math.floor(rand(seed + f * 5.9) * cs.length)]);
    }
    im.raycast = () => {};
    body.add(im);
  }
  function hills(body, r, top, seed, k = 1) {
    const n = Math.max(1, Math.round((1 + Math.round(r / 6)) * k));
    for (let h = 0; h < n; h++) {
      const hs = r * (0.28 + rand(seed + h * 5) * 0.14);
      const hill = outline(new THREE.Mesh(new THREE.IcosahedronGeometry(hs, 2), hillMat), 1.03);
      const a = rand(seed + h) * 6.28, d = r * 0.25 * rand(seed + h * 2);
      hill.position.set(Math.cos(a) * d - r * 0.1, top - hs * 0.35, Math.sin(a) * d * 0.8 - r * 0.15);
      hill.scale.y = 0.55; body.add(hill);
    }
  }
  function rocks(body, r, y, seed, n = 2, k = 1) {
    for (let i = 0; i < n; i++) {
      const rock = outline(new THREE.Mesh(i % 2 ? ballGeo : puffGeo, rockMat), 1.08);
      const a = rand(seed * 3 + i) * 6.28;
      rock.position.set(Math.cos(a) * r * 0.92, y, Math.sin(a) * r * 0.78);
      rock.scale.setScalar((0.5 + rand(seed + i * 9) * 0.5) * k);
      body.add(rock);
    }
  }
  const scatter = (body, r, top, seed, n, make, inner = 0.38, outer = 0.36) => {
    for (let t = 0; t < n; t++) {
      const a = rand(seed + t * 3.1) * Math.PI * 2, rr = r * (inner + rand(seed + t) * outer);
      const o = make(rand(seed * 7 + t), t);
      o.position.set(Math.cos(a) * rr, top, Math.sin(a) * rr * 0.8);
      body.add(o);
    }
  };

  // ---------- 叢林造景 ----------
  function jungleTree(rnd) {
    const g = new THREE.Group();
    const h = 4.2 + rnd * 2.6;
    const trunk = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, h, 7), toon(0x6b4a2e)), 1.1);
    trunk.position.y = h / 2; g.add(trunk);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.0, 4), toon(0x5a3d26)); b.position.set(Math.cos(i * 2.1) * 0.35, 0.4, Math.sin(i * 2.1) * 0.35); b.rotation.z = Math.cos(i * 2.1) * 0.5; b.rotation.x = -Math.sin(i * 2.1) * 0.5; g.add(b); }
    const crown = new THREE.Group(); crown.position.y = h; g.add(crown);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28 + rnd;
      const m = outline(new THREE.Mesh(puffGeo, leafMats[i % 4]), 1.06);
      m.position.set(Math.cos(a) * 1.3, (i % 2) * 0.4, Math.sin(a) * 1.3); m.scale.set(1.3, 0.55, 1.3); crown.add(m);
    }
    const c0 = outline(new THREE.Mesh(puffGeo, leafMats[2]), 1.06); c0.position.y = 0.6; c0.scale.set(1.4, 0.7, 1.4); crown.add(c0);
    for (let i = 0; i < 4; i++) {
      const a = rnd * 6 + i * 1.6, vl = 1.6 + rand(rnd * 9 + i) * 1.8;
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, vl, 4), toon(0x2f5a2a));
      v.position.set(Math.cos(a) * 1.6, -vl / 2, Math.sin(a) * 1.6); crown.add(v);
      const lf = new THREE.Mesh(ballGeo, toon(0x4f9a3a)); lf.scale.set(0.18, 0.1, 0.25); lf.position.set(Math.cos(a) * 1.6, -vl, Math.sin(a) * 1.6); crown.add(lf);
    }
    g.scale.setScalar(0.7 + rnd * 0.35); g.rotation.y = rnd * 6.28;
    swayers.push({ o: crown, ph: rnd * 6.28, amp: 0.035 });
    return g;
  }
  function fern(rnd) {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const pv = new THREE.Group(); pv.rotation.y = (i / 7) * 6.28 + rnd; g.add(pv);
      const l = outline(new THREE.Mesh(puffGeo, toon(i % 2 ? 0x58b048 : 0x3f9a3a)), 1.06);
      l.scale.set(0.22, 0.05, 1.0); l.position.set(0, 0.45, 0.75); l.rotation.x = -0.5; pv.add(l);
    }
    if (rnd > 0.5) { const fl = new THREE.Mesh(ballGeo, toon(0xff5d73)); fl.scale.setScalar(0.25); fl.position.y = 0.6; g.add(fl); }
    g.scale.setScalar(0.9 + rnd * 0.6);
    return g;
  }
  function ruins(rnd) {
    const g = new THREE.Group();
    const stone = toon(0x8c9a7a), moss = toon(0x4f7f3a);
    if (rnd > 0.45) {
      for (let k = 0; k < 4; k++) {
        const s = 3.4 - k * 0.75;
        const b = outline(new THREE.Mesh(new THREE.BoxGeometry(s, 0.75, s), stone), 1.04); b.position.y = 0.38 + k * 0.75; g.add(b);
        const m = new THREE.Mesh(new THREE.BoxGeometry(s * 0.5, 0.12, s * 0.3), moss); m.position.set(s * 0.15, 0.78 + k * 0.75, s * 0.3); g.add(m);
      }
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.05), toon(0x2a2a22)); door.position.set(0, 3.25, 0.5); g.add(door);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.8), toon(0x7a8a6a)); st.position.set(0, 1.5, 1.6); st.rotation.x = 0.85; g.add(st);
    } else {
      for (let k = 0; k < 3; k++) {
        const h = 1.6 + rand(rnd * 7 + k) * 1.8;
        const p = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, h, 8), stone), 1.06); p.position.set(-1.4 + k * 1.4, h / 2, 0); g.add(p);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.9), stone); cap.position.set(-1.4 + k * 1.4, h + 0.12, 0); g.add(cap);
      }
      const lint = outline(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 0.8), stone), 1.04); lint.position.set(-0.7, 3.2, 0); lint.rotation.z = 0.12; g.add(lint);
      const fallen = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 8), stone), 1.06); fallen.position.set(0.8, 0.35, 1.3); fallen.rotation.z = Math.PI / 2; fallen.rotation.y = 0.6; g.add(fallen);
    }
    g.rotation.y = rnd * 6.28;
    return g;
  }

  // ---------- 海洋造景 ----------
  function umbrella(rnd) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), toon(0xffffff)); pole.position.y = 1.1; g.add(pole);
    const cols = [0xef476f, 0xffffff, 0x118ab2, 0xffd166];
    for (let i = 0; i < 8; i++) {
      const seg = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.55, 3, 1, true, (i / 8) * 6.283, 6.283 / 8), toon(cols[(i + Math.floor(rnd * 4)) % 2 ? 0 : 1 + Math.floor(rnd * 2) * 2], { side: THREE.DoubleSide }));
      seg.position.y = 2.25; g.add(seg);
    }
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 1.8), toon(cols[Math.floor(rnd * 4)])); towel.position.set(0.9, 0.02, 0.4); towel.rotation.y = 0.3; g.add(towel);
    g.rotation.y = rnd * 6.28;
    return g;
  }
  function lighthouse() {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const s = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.85 - (k + 1) * 0.08, 0.85 - k * 0.08, 1.2, 12), toon(k % 2 ? 0xffffff : 0xd62828)), 1.05);
      s.position.y = 0.6 + k * 1.2; g.add(s);
    }
    const deck = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.15, 12), toon(0x2a2a2a)), 1.06); deck.position.y = 6.05; g.add(deck);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 10), toon(0xfff3b0, { emissive: 0xffd166 })); lamp.position.y = 6.5; g.add(lamp);
    const cap = outline(new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.6, 10), toon(0xd62828)), 1.06); cap.position.y = 7.15; g.add(cap);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    beam.rotation.z = Math.PI / 2; beam.position.set(7, 0, 0);
    const beamPv = new THREE.Group(); beamPv.position.y = 6.5; beamPv.add(beam); g.add(beamPv);
    beam.raycast = () => {};
    updaters.push((t) => { beamPv.rotation.y = t * 0.8; });
    return g;
  }
  function coral(body, r, seed) {
    const cols = [0xff6b6b, 0xff9f1c, 0xc77dff, 0xffd166, 0xff8fab, 0x4cc9f0];
    for (let i = 0; i < Math.round(r * 1.6); i++) {
      const a = rand(seed * 5 + i * 1.3) * 6.28, rr = r * (1.03 + rand(seed + i * 2.7) * 0.25);
      const g = new THREE.Group(); g.position.set(Math.cos(a) * rr, -0.2, Math.sin(a) * rr * 0.85);
      const c = cols[Math.floor(rand(seed + i * 4.1) * cols.length)];
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.9, 5), toon(c));
        b.position.set((k - 1) * 0.18, 0.4, 0); b.rotation.z = (k - 1) * 0.5; g.add(b);
        const tip = new THREE.Mesh(ballGeo, toon(c)); tip.scale.setScalar(0.14); tip.position.set((k - 1) * 0.4, 0.8, 0); g.add(tip);
      }
      g.rotation.y = a; g.scale.setScalar(0.7 + rand(seed + i) * 0.6);
      body.add(g);
    }
  }

  // ---------- 動物園造景 ----------
  function fence(body, r, top, seed) {
    const pts = blobShape(r * 0.9, seed).getPoints(Math.round(r * 4));
    const postMat = toon(0x8a5a33), railMat = toon(0xa9744a);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const post = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.3, 5), postMat), 1.12);
      post.position.set(a.x, top + 0.65, -a.y); body.add(post);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (const h of [0.45, 1.0]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.08), railMat);
        rail.position.set((a.x + b.x) / 2, top + h, -(a.y + b.y) / 2);
        rail.rotation.y = Math.atan2(b.y - a.y, b.x - a.x);
        body.add(rail);
      }
    }
  }
  function hut(rnd) {
    const g = new THREE.Group();
    const wall = outline(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 1.3, 8), toon(0xb07a4a)), 1.05); wall.position.y = 0.65; g.add(wall);
    const roof = outline(new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.3, 8), toon(0xd9b45a)), 1.05); roof.position.y = 1.95; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.05), toon(0x3b2a1e)); door.position.set(0, 0.45, 1.05); g.add(door);
    g.rotation.y = rnd * 6.28; return g;
  }

  // ---------- 非洲草原造景 ----------
  function acacia(rnd) {
    const g = new THREE.Group();
    const tm = toon(0x6b4a2e);
    const t1 = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 2.6, 6), tm), 1.1); t1.position.y = 1.3; t1.rotation.z = 0.12; g.add(t1);
    for (const s of [-1, 1]) { const b = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 5), tm), 1.1); b.position.set(s * 0.55 + 0.15, 3.0, 0); b.rotation.z = -s * 0.7; g.add(b); }
    const crown = new THREE.Group(); crown.position.y = 3.65; g.add(crown);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.28 + rnd;
      const m = outline(new THREE.Mesh(puffGeo, leafMats[i % 4]), 1.06);
      m.position.set(Math.cos(a) * 1.5, rand(rnd * 5 + i) * 0.15, Math.sin(a) * 1.2); m.scale.set(1.0, 0.32, 1.0); crown.add(m);
    }
    const c0 = outline(new THREE.Mesh(puffGeo, leafMats[1]), 1.06); c0.scale.set(1.5, 0.38, 1.3); c0.position.y = 0.15; crown.add(c0);
    g.scale.setScalar(0.9 + rnd * 0.5); g.rotation.y = rnd * 6.28;
    swayers.push({ o: crown, ph: rnd * 6.28, amp: 0.02 });
    return g;
  }
  function grassTufts(parent, n, area, y, seed, color) {
    const im = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.9, 4), toon(color), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const [x, z] = area(i);
      e.set((rand(seed + i) - 0.5) * 0.5, 0, (rand(seed * 2 + i) - 0.5) * 0.5); q.setFromEuler(e);
      const s = 0.6 + rand(seed * 3 + i) * 0.8; sc.set(s, s, s);
      p.set(x, y + 0.4 * s, z);
      m4.compose(p, q, sc); im.setMatrixAt(i, m4);
    }
    im.raycast = () => {};
    parent.add(im);
  }
  function termite(rnd) {
    const g = new THREE.Group();
    const m = outline(new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.4 + rnd, 7), toon(0xb5651d)), 1.06); m.position.y = 1.2 + rnd * 0.5; g.add(m);
    const m2 = outline(new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), toon(0xa0561a)), 1.08); m2.position.set(0.5, 0.7, 0.2); g.add(m2);
    return g;
  }

  // ---------- 島嶼 ----------
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  const foams = [];
  const islands = [];
  const pickables = [];
  const top3d = 1.3 + raise;

  App.catList.forEach((c, i) => {
    const r = c.r / 10;
    const wx = (c.x - 800) / 10, wz = (c.y - 550) / 10;
    const seed = c.seed;
    const host = HOSTS ? HOSTS[c.name] : null;
    const root = new THREE.Group(); root.position.set(wx, 0, wz);
    const body = new THREE.Group(); root.add(body);

    if (isWater) {
      const shallow = new THREE.Mesh(new THREE.ShapeGeometry(blobShape(r * 1.35, seed, 0.1)),
        new THREE.MeshBasicMaterial({ color: T.water.ring, transparent: true, opacity: 0.5, depthWrite: false }));
      shallow.rotation.x = -Math.PI / 2; shallow.position.y = 0.42; root.add(shallow);
      const fs = blobShape(r * 1.12, seed, 0.12);
      fs.holes.push(new THREE.Path(blobShape(r * 1.02, seed, 0.12).getPoints(64)));
      const foam = new THREE.Mesh(new THREE.ShapeGeometry(fs), foamMat);
      foam.rotation.x = -Math.PI / 2; foam.position.y = 0.48; root.add(foam); foams.push({ m: foam, ph: seed });
    } else {
      const ring = new THREE.Mesh(new THREE.ShapeGeometry(blobShape(r * (themeId === "zoo" ? 1.28 : 1.4), seed, 0.1)), toon(T.plain.ring));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; root.add(ring);
    }

    // 地形：岩壁＋沙灘＋草地
    const cliff = outline(new THREE.Mesh(flatExtrude(blobShape(r * 0.98, seed), 1.6 + raise, 0.5), cliffMat), 1.025);
    cliff.position.y = -2.4; body.add(cliff);
    const sand = new THREE.Mesh(flatExtrude(blobShape(r, seed), 0.6, 0.5), sandMat);
    sand.position.y = -0.6 + raise; body.add(sand);
    const landMat = toon(T.land[i % T.land.length]);
    const land = outline(new THREE.Mesh(flatExtrude(blobShape(r * (T.sandWide ? 0.66 : 0.84), seed + 0.5), 0.6, 0.45), landMat), 1.02);
    land.position.y = 0.25 + raise; body.add(land);
    const top = top3d;

    // 依情境造景
    if (themeId === "ghibli") {
      hills(body, r, top, seed); rocks(body, r, 0.1, seed);
      if (r > 7) { const a = rand(seed * 11) * 6.28; const h = cottage(rand(seed * 13)); h.position.set(Math.cos(a) * r * 0.32, top, Math.sin(a) * r * 0.26); h.scale.setScalar(0.9 + r * 0.03); body.add(h); }
      scatter(body, r, top, seed, Math.min(12, 3 + Math.round(c.items.length / 26)), (k) => (k > 0.78 ? cypress(k) : tree(k)));
      flowers(body, r, top, seed, [0xffffff, 0xffe066, 0xff8fab, 0xc77dff, 0xff6b6b]);
    } else if (themeId === "jungle") {
      hills(body, r, top, seed, 0.8); rocks(body, r, 0.1, seed, 3);
      if (r > 7.5) { const rn = rand(seed * 17); const ru = ruins(rn); const a = rand(seed * 11) * 6.28; ru.position.set(Math.cos(a) * r * 0.28, top, Math.sin(a) * r * 0.22); ru.scale.setScalar(0.8 + r * 0.025); body.add(ru); }
      scatter(body, r, top, seed, Math.min(10, 3 + Math.round(c.items.length / 30)), (k) => jungleTree(k), 0.4, 0.36);
      scatter(body, r, top, seed * 3, Math.round(r * 0.9), (k) => fern(k), 0.3, 0.5);
      flowers(body, r, top, seed, [0xff5d73, 0xff9f1c, 0xffd166, 0xff70a6], Math.round(r * 3));
    } else if (themeId === "ocean") {
      hills(body, r * 0.75, top, seed, 0.6); rocks(body, r, 0.0, seed, 3);
      scatter(body, r, top - 0.2, seed, Math.min(7, 2 + Math.round(c.items.length / 45)), (k) => palm(k), 0.5, 0.3);
      if (r > 6.5) scatter(body, r, top - 0.25, seed * 5, 1 + Math.round(r / 7), (k) => umbrella(k), 0.72, 0.12);
      if (i === 0) { const lh = lighthouse(); lh.position.set(-r * 0.25, top, -r * 0.2); lh.scale.setScalar(1.2); body.add(lh); }
      coral(body, r, seed);
      flowers(body, r * 0.66, top, seed, [0xffffff, 0xffb4a2, 0xffe066], Math.round(r * 2));
    } else if (themeId === "zoo") {
      fence(body, r, top, seed);
      hills(body, r * 0.7, top, seed, 0.5); rocks(body, r * 0.75, top, seed, 2, 1.2);
      scatter(body, r * 0.75, top, seed, Math.min(5, 1 + Math.round(c.items.length / 60)), (k) => tree(k), 0.45, 0.35);
      if (r > 6) { const h = hut(rand(seed * 19)); const a = rand(seed * 11) * 6.28; h.position.set(Math.cos(a) * r * 0.45, top, Math.sin(a) * r * 0.35); body.add(h); }
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r * 0.22, 20), toon(T.plain.pond)); pool.rotation.x = -Math.PI / 2;
      pool.position.set(-r * 0.3, top + 0.03, r * 0.25); body.add(pool);
      if (host) { const sg = textSprite(`${host.emoji} ${host.name}`, Math.max(6, r * 0.75)); sg.position.set(0, top + 2.0, r * 0.82); sg.renderOrder = 5; body.add(sg); }
      flowers(body, r * 0.8, top, seed, [0xffffff, 0xffe066], Math.round(r * 2));
    } else if (themeId === "safari") {
      rocks(body, r * 0.8, top, seed, 3, 2.2);
      scatter(body, r, top, seed, Math.min(4, 1 + Math.round(c.items.length / 70)), (k) => acacia(k), 0.45, 0.35);
      if (rand(seed * 23) > 0.5) { const tm = termite(rand(seed)); const a = rand(seed * 29) * 6.28; tm.position.set(Math.cos(a) * r * 0.55, top, Math.sin(a) * r * 0.45); body.add(tm); }
      grassTufts(body, Math.round(r * 6), (k) => { const a = rand(seed + k * 1.7) * 6.28, rr = r * 0.8 * Math.sqrt(rand(seed * 2 + k)); return [Math.cos(a) * rr, Math.sin(a) * rr * 0.8]; }, top, seed, 0xe0b85a);
    }

    // 選取光圈
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.4, r * 1.58, 64),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.5 + (isWater ? 0 : 0.1); root.add(ring);

    // 標籤與搜尋數字
    const labelW = Math.max(r * 2.3, 19);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture(App.emoji[c.name] || "🏝️", c.name, `${c.items.length} 支`), depthTest: false, transparent: true, toneMapped: false,
    }));
    label.scale.set(labelW, labelW * 300 / 512, 1);
    label.position.y = top + 3.5 + labelW * 0.3;
    label.renderOrder = 10; body.add(label);
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true, toneMapped: false }));
    badge.scale.setScalar(5);
    badge.position.set(labelW * 0.42, label.position.y + labelW * 0.2, 0);
    badge.renderOrder = 11; badge.visible = false; body.add(badge);

    // 島主：職人或動物
    let person = null, animal = null, hostH = 4.3, hostParent = body, hostBaseY = top;
    const charScale = 1.6 + r * 0.05;
    if (host) {
      animal = buildAnimal(host.id, mat, outline);
      if (animal) {
        const bb = new THREE.Box3().setFromObject(animal.root), sz = bb.getSize(new THREE.Vector3());
        const k = (6.6 + r * 0.16) * Math.min(1.6, animal.size) / Math.max(sz.y, Math.max(sz.x, sz.z) * 0.8);
        animal.root.scale.setScalar(k);
        hostH = sz.y * k;
        if (animal.habitat === "water") { hostParent = root; hostBaseY = -0.7; }
      }
    }
    if (!animal) {
      person = makePerson(CHARS[c.name] || CHARS["其他"]);
      person.root.scale.setScalar(charScale);
      hostH = 4.3 * charScale;
    }
    const hostObj = animal ? animal.root : person.root;
    hostObj.position.y = hostBaseY;
    hostParent.add(hostObj);
    const head = host ? (host.sound + "選我！") : "選我！";
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({
      map: bubbleTexture((App.shout && App.shout[c.name]) || "我最好用", head, T.bubble), depthTest: false, transparent: true, opacity: 0, toneMapped: false,
    }));
    bubble.renderOrder = 12; bubble.visible = false;
    hostParent.add(bubble);

    root.userData.cat = c.name;
    scene.add(root);
    pickables.push(root);
    islands.push({
      person, animal, hostObj, hostParent, hostBaseY, hostH, bubble, pop: 0, shoutUntil: 0,
      c, root, body, ring, label, badge, r, wx, wz, seed, labelW,
      lift: 0, liftTo: 0, sink: 0, sinkTo: 0, op: 1, opTo: 1, badgeN: -1,
    });
  });

  // ---------- 叢林：吊橋 ----------
  if (themeId === "jungle") {
    const used = new Set(), plank = toon(0x9b7448), rope = toon(0x6b4f2e);
    const pairs = [];
    islands.forEach((a, ia) => islands.forEach((b, ib) => {
      if (ib <= ia) return;
      const d = Math.hypot(a.wx - b.wx, a.wz - b.wz), gap = d - a.r - b.r;
      if (gap > 2 && gap < 16) pairs.push({ a, b, d, gap });
    }));
    pairs.sort((p, q) => p.gap - q.gap);
    let made = 0;
    for (const p of pairs) {
      if (made >= 6 || used.has(p.a) || used.has(p.b)) continue;
      used.add(p.a); used.add(p.b); made++;
      const dir = new THREE.Vector3(p.b.wx - p.a.wx, 0, p.b.wz - p.a.wz).normalize();
      const A = new THREE.Vector3(p.a.wx, top3d, p.a.wz).addScaledVector(dir, p.a.r * 0.82);
      const B = new THREE.Vector3(p.b.wx, top3d, p.b.wz).addScaledVector(dir, -p.b.r * 0.82);
      const len = A.distanceTo(B), n = Math.max(6, Math.round(len / 0.7));
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const ang = Math.atan2(dir.x, dir.z);
      const pt = (k) => { const t = k / n; return A.clone().lerp(B, t).add(new THREE.Vector3(0, -Math.sin(Math.PI * t) * len * 0.08, 0)); };
      for (let k = 0; k <= n; k++) {
        const q = pt(k);
        const pl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.45), plank); pl.position.copy(q); pl.rotation.y = ang + Math.PI / 2; pl.rotation.order = "YXZ"; scene.add(pl);
        if (k % 2 === 0) for (const s of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 4), rope); post.position.copy(q).addScaledVector(side, s * 0.9).add(new THREE.Vector3(0, 0.55, 0)); scene.add(post);
        }
      }
      for (const s of [-1, 1]) for (let k = 0; k < n; k++) {
        const a = pt(k).addScaledVector(side, s * 0.9).add(new THREE.Vector3(0, 1.1, 0)), b = pt(k + 1).addScaledVector(side, s * 0.9).add(new THREE.Vector3(0, 1.1, 0));
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, a.distanceTo(b), 4), rope);
        seg.position.copy(a).lerp(b, 0.5); seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); scene.add(seg);
      }
    }
  }

  // ---------- 草原上的造景（動物園、非洲） ----------
  const gapPoints = (n, minClear, seed) => {
    const pts = [];
    for (let k = 0; k < 400 && pts.length < n; k++) {
      const x = (rand(seed + k * 1.37) - 0.5) * 170, z = (rand(seed * 2 + k * 2.11) - 0.5) * 120;
      const ok = islands.every((s) => Math.hypot(s.wx - x, s.wz - z) > s.r * 1.45 + minClear) && pts.every((p) => Math.hypot(p[0] - x, p[1] - z) > minClear * 2.2)
        && Math.abs((x / RX) ** 2 + (z / RZ) ** 2 - 1) > 0.18;
      if (ok) pts.push([x, z]);
    }
    return pts;
  };
  const ponds = [];
  if (!isWater) {
    for (const [x, z] of gapPoints(themeId === "safari" ? 3 : 2, 5, 7.7)) {
      const pd = new THREE.Mesh(new THREE.ShapeGeometry(blobShape(6 + rand(x) * 3, x, 0.18)), toon(T.plain.pond));
      pd.rotation.x = -Math.PI / 2; pd.position.set(x, 0.05, z); scene.add(pd);
      const rim = new THREE.Mesh(new THREE.ShapeGeometry(blobShape(7.4 + rand(x) * 3, x, 0.18)), toon(themeId === "safari" ? 0x9a7a4a : 0x6faa45));
      rim.rotation.x = -Math.PI / 2; rim.position.set(x, 0.02, z); scene.add(rim);
      ponds.push([x, z]);
    }
    const nT = themeId === "safari" ? 700 : 400;
    grassTufts(scene, nT, (k) => {
      for (let tries = 0; tries < 8; tries++) {
        const x = (rand(k * 3.1 + tries) - 0.5) * 300, z = (rand(k * 5.7 + tries) - 0.5) * 220;
        if (islands.every((s) => Math.hypot(s.wx - x, s.wz - z) > s.r * 1.45)) return [x, z];
      }
      return [400, 400];
    }, -0.2, 3.3, themeId === "safari" ? 0xe9c46a : 0x6fa83f);
    const deco = gapPoints(themeId === "safari" ? 14 : 10, 3, 19.1);
    deco.forEach(([x, z], k) => {
      const o = themeId === "safari" ? (k % 4 === 3 ? termite(rand(k)) : acacia(rand(k * 3))) : tree(rand(k * 3));
      o.position.set(x, -0.2, z); o.scale.multiplyScalar(themeId === "safari" ? 1.4 : 1.2); scene.add(o);
    });
    if (themeId === "zoo") {
      // 外圍步道
      const outer = new THREE.Shape(); outer.absellipse(0, 0, RX + 3.5, RZ + 3.5, 0, Math.PI * 2);
      outer.holes.push(new THREE.Path().absellipse(0, 0, RX - 3.5, RZ - 3.5, 0, Math.PI * 2, true));
      const path = new THREE.Mesh(new THREE.ShapeGeometry(outer, 96), toon(T.plain.ring));
      path.rotation.x = -Math.PI / 2; path.position.y = 0.04; scene.add(path);
      for (const k of [-1.2, 1.2]) {
        const rail = new THREE.Shape(); rail.absellipse(0, 0, RX + k + 0.15, RZ + k + 0.15, 0, Math.PI * 2);
        rail.holes.push(new THREE.Path().absellipse(0, 0, RX + k - 0.15, RZ + k - 0.15, 0, Math.PI * 2, true));
        const m = new THREE.Mesh(new THREE.ShapeGeometry(rail, 128), toon(0x8a7a6a)); m.rotation.x = -Math.PI / 2; m.position.y = 0.08; scene.add(m);
      }
    }
  }

  // ---------- 天空：雲、積雲塔、雲影、絨毛、鳥 ----------
  const cloudMat = new THREE.MeshToonMaterial({ color: 0xffffff, emissive: themeId === "safari" ? 0x8a6a5a : 0x6c7896, gradientMap: toonRamp, transparent: true, opacity: 0.96 });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const puffs = 6 + Math.floor(rand(i * 3.3) * 5);
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(puffGeo, cloudMat);
      const s = 3 + rand(i * 11 + p) * 4;
      const up = Math.max(0, 1 - Math.abs(p - puffs / 2) / (puffs / 2));
      m.scale.set(s, s * 0.85, s);
      m.position.set((p - puffs / 2) * 3.2, up * 4 + rand(i + p * 7) * 1.5, rand(i * 2 + p) * 3 - 1.5);
      g.add(m);
    }
    g.userData = { ang: (i / 14) * Math.PI * 2 + rand(i) * 0.4, rad: 135 + rand(i * 5) * 80, h: 22 + rand(i * 9) * 14, speed: 0.012 + rand(i * 4) * 0.02 };
    scene.add(g); clouds.push(g);
  }
  const towerMat = new THREE.MeshToonMaterial({ color: 0xffffff, emissive: themeId === "safari" ? 0x9a7a6a : 0x7a84a8, gradientMap: toonRamp, fog: false });
  const towers = [];
  for (let i = 0; i < 11; i++) {
    const g = new THREE.Group();
    const h = 34 + rand(i * 7.7) * 34, w = 22 + rand(i * 3.9) * 22;
    for (let p = 0; p < 26; p++) {
      const lv = rand(i * 13 + p * 1.9);
      const s = (0.22 + rand(i * 5 + p) * 0.18) * w * (1 - lv * 0.45);
      const m = new THREE.Mesh(puffGeo, towerMat);
      const spread = w * (1 - lv * 0.6);
      m.position.set((rand(i + p * 3.1) - 0.5) * spread, 4 + Math.pow(lv, 0.9) * h, (rand(i * 2 + p * 4.3) - 0.5) * spread * 0.5);
      m.scale.set(s, s * 0.85, s); g.add(m);
    }
    const a = (i / 11) * Math.PI * 2 + rand(i * 2.2) * 0.3, rad = 215 + rand(i * 6.1) * 45;
    g.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad * 0.85);
    scene.add(g); towers.push(g);
  }
  const shadowTex = softDot();
  const cloudShadows = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, color: isWater ? T.water.shadow : T.plain.shadow, transparent: true, opacity: 0.2, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = isWater ? 0.55 : 0.3;
    const s = 40 + rand(i * 8.8) * 40; m.scale.set(s * 1.4, s, 1);
    m.userData = { x: (rand(i * 2.7) - 0.5) * 260, z: (rand(i * 3.1) - 0.5) * 160, sp: 2 + rand(i) * 2 };
    m.renderOrder = 1; scene.add(m); cloudShadows.push(m);
  }
  const FLUFF = REDUCED ? 0 : (T.fluffN ?? 160);
  const fluffPos = new Float32Array(FLUFF * 3), fluffSeed = new Float32Array(FLUFF);
  for (let i = 0; i < FLUFF; i++) {
    fluffPos[i * 3] = (rand(i * 1.1) - 0.5) * 220; fluffPos[i * 3 + 1] = 3 + rand(i * 2.2) * 30; fluffPos[i * 3 + 2] = (rand(i * 3.3) - 0.5) * 160;
    fluffSeed[i] = rand(i * 4.4) * 6.28;
  }
  const fluffGeo = new THREE.BufferGeometry();
  fluffGeo.setAttribute("position", new THREE.BufferAttribute(fluffPos, 3));
  scene.add(new THREE.Points(fluffGeo, new THREE.PointsMaterial({ size: 0.9, map: softDot(), transparent: true, opacity: 0.85, depthWrite: false, color: T.fluff })));

  const birdMat = new THREE.MeshBasicMaterial({ color: themeId === "safari" ? 0x2a1f1a : 0x3b3326, side: THREE.DoubleSide });
  const birds = [];
  if (themeId !== "jungle" && themeId !== "ocean") for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const wingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.4), new THREE.Vector3(0, 0, 0.4), new THREE.Vector3(1.6, 0.2, 0)]);
    const l = new THREE.Mesh(wingGeo, birdMat), rr = new THREE.Mesh(wingGeo, birdMat);
    rr.scale.x = -1; g.add(l, rr);
    if (themeId === "safari") g.scale.setScalar(1.6);
    g.userData = { l, rr, ph: rand(i * 17) * 6.28, rad: 40 + i * 9, h: (themeId === "safari" ? 34 : 22) + i * 2, sp: 0.12 + rand(i) * 0.05 };
    scene.add(g); birds.push(g);
  }

  // ---------- 漫遊動物 ----------
  // 依最大尺寸正規化大小（size = 目標的最大邊長）
  const rig = (id, size) => {
    const a = buildAnimal(id, mat, outline);
    const sz = new THREE.Box3().setFromObject(a.root).getSize(new THREE.Vector3());
    a.root.scale.setScalar(size / Math.max(sz.x, sz.y, sz.z));
    scene.add(a.root); return a;
  };
  const nearHide = (o, d = 55) => { o.visible = o.position.distanceTo(camera.position) > d; };
  const along = (o, a, rx, rz, dir, y = 0) => {
    o.position.set(Math.cos(a) * rx, y, Math.sin(a) * rz);
    o.rotation.y = Math.atan2(-Math.sin(a) * rx * dir, Math.cos(a) * rz * dir);
  };
  if (themeId === "jungle") {
    for (let i = 0; i < 4; i++) {
      const p = rig("parrot", 3.2), ph = i * 1.6, rad = 35 + i * 14, sp = 0.18 - i * 0.02, h = 18 + i * 3;
      updaters.push((t) => { const a = ph + t * sp; p.root.position.set(Math.cos(a) * rad, h + Math.sin(t * 1.3 + i) * 1.5, Math.sin(a) * rad * 0.7); p.root.rotation.y = -a; animateAnimal(p, t, true, i, REDUCED); p.fig.position.y = 0; });
    }
    for (let i = 0; i < 2; i++) {
      const cr = rig("croc", 9); faceForward(cr);
      const dir = i ? 1 : -1, ph = i * 3;
      updaters.push((t) => { const a = ph + t * 0.03 * dir; along(cr.root, a, RX + 4, RZ + 4, dir, -0.55); nearHide(cr.root); });
    }
    const bfCols = [0xffd166, 0xff70a6, 0x4cc9f0, 0xffffff, 0xf77f00];
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Group();
      const wm = new THREE.MeshBasicMaterial({ color: bfCols[i % 5], side: THREE.DoubleSide });
      const wg = new THREE.CircleGeometry(0.35, 8);
      const w1 = new THREE.Mesh(wg, wm), w2 = new THREE.Mesh(wg, wm);
      w1.position.x = 0.3; w2.position.x = -0.3; g.add(w1, w2);
      const isl = islands[i % islands.length];
      scene.add(g);
      updaters.push((t) => {
        const a = t * 0.6 + i;
        g.position.set(isl.wx + Math.cos(a) * isl.r * 0.7, top3d + 3 + Math.sin(t * 2 + i) * 1.2, isl.wz + Math.sin(a * 1.3) * isl.r * 0.5);
        const f = Math.sin(t * 22 + i) * 1.1; w1.rotation.y = f; w2.rotation.y = -f; g.rotation.y = -a;
      });
    }
  }
  if (themeId === "ocean") {
    for (let i = 0; i < 5; i++) {
      const d = rig("dolphin", 5); const ph = (i < 3 ? i * 0.07 : 3 + i * 0.1), sp = 0.07, k = i % 3;
      updaters.push((t) => {
        const a = ph + t * sp;
        along(d.root, a, RX + k * 2.5, RZ + k * 2.5, 1, 0);
        const c = t * 1.6 + i * 0.7, s = Math.sin(c);
        d.root.position.y = -1.6 + Math.max(0, s) * 3.6;
        d.fig.rotation.x = -Math.cos(c) * 0.6 * (s > 0 ? 1 : 0.3);
        nearHide(d.root);
      });
    }
    const wh = rig("whale", 16);
    const spout = new THREE.Group(); scene.add(spout);
    for (let k = 0; k < 8; k++) { const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })); m.userData.k = k; spout.add(m); }
    updaters.push((t) => {
      const a = 2 + t * 0.02;
      along(wh.root, a, 125, 88, 1, 0);
      const surf = Math.sin(t * 0.35);
      wh.root.position.y = -3.2 + Math.max(0, surf) * 3.0;
      spout.position.copy(wh.root.position).add(new THREE.Vector3(0, 5, 0));
      spout.visible = surf > 0.6;
      spout.children.forEach((m) => { const kk = (t * 2 + m.userData.k / 8) % 1; m.position.set(Math.sin(m.userData.k) * kk * 1.2, kk * 5, Math.cos(m.userData.k) * kk * 1.2); m.scale.setScalar(0.6 + kk); m.material.opacity = 0.8 * (1 - kk); });
    });
    for (let i = 0; i < 3; i++) {
      const tu = rig("turtle", 4); const ph = 1 + i * 2.1;
      updaters.push((t) => { along(tu.root, ph - t * 0.02, RX - 6, RZ - 4 + i, -1, -0.15); animateAnimal(tu, t, true, i, REDUCED); tu.fig.position.y = 0; tu.fig.rotation.x = 0; nearHide(tu.root); });
    }
    for (let i = 0; i < 5; i++) {
      const g = rig("seagull", 3), ph = i * 1.3, rad = 40 + i * 12, h = 20 + i * 2.5;
      updaters.push((t) => { const a = ph + t * 0.15; g.root.position.set(Math.cos(a) * rad, h, Math.sin(a) * rad * 0.7); g.root.rotation.y = -a; animateAnimal(g, t * 0.6, true, i, REDUCED); g.fig.position.y = 0; });
    }
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group();
      const hull = outline(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 4.2), toon(i % 2 ? 0xffffff : 0xd62828)), 1.04); hull.position.y = 0.2; b.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5, 5), toon(0x8a6540)); mast.position.y = 2.9; b.add(mast);
      const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.9, 0.2), new THREE.Vector3(0, 5.2, 0.2), new THREE.Vector3(0, 0.9, -2.0)]), new THREE.MeshBasicMaterial({ color: 0xfffaf0, side: THREE.DoubleSide }));
      b.add(sail); scene.add(b);
      const ph = i * 2.1;
      updaters.push((t) => { along(b, ph + t * 0.012, 112, 80, 1, -0.1); b.rotation.z = Math.sin(t * 1.2 + i) * 0.06; nearHide(b, 70); });
    }
  }
  if (themeId === "zoo") {
    const train = [];
    const colors = [0xd62828, 0x118ab2, 0xffd166, 0x06d6a0];
    for (let k = 0; k < 4; k++) {
      const car = new THREE.Group();
      const bodyM = outline(new THREE.Mesh(new THREE.BoxGeometry(1.8, k === 0 ? 1.6 : 1.1, 3.0), toon(colors[k])), 1.04); bodyM.position.y = k === 0 ? 1.2 : 0.95; car.add(bodyM);
      if (k === 0) { const ch = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.0, 8), toon(0x333333)), 1.08); ch.position.set(0, 2.4, 0.9); car.add(ch); }
      else { const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 3.2), toon(0xfffaf0)); roof.position.y = 2.3; car.add(roof); for (const x of [-0.85, 0.85]) for (const z of [-1.3, 1.3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 4), toon(0xfffaf0)); p.position.set(x, 1.85, z); car.add(p); } }
      for (const x of [-0.9, 0.9]) for (const z of [-0.9, 0.9]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 10), toon(0x2a2a2a)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.35, z); car.add(w); }
      scene.add(car); train.push(car);
    }
    updaters.push((t) => { train.forEach((car, k) => { along(car, t * 0.05 - k * 0.042, RX, RZ, 1, 0.05); nearHide(car, 45); }); });
    for (const [x, z] of ponds) for (let k = 0; k < 3; k++) {
      const d = new THREE.Group();
      const b = outline(new THREE.Mesh(puffGeo, toon(0xffffff)), 1.1); b.scale.set(0.5, 0.35, 0.7); d.add(b);
      const h = outline(new THREE.Mesh(puffGeo, toon(0x2a9d5c)), 1.1); h.scale.setScalar(0.28); h.position.set(0, 0.4, 0.45); d.add(h);
      const bk = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), toon(0xffb703)); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.38, 0.75); d.add(bk);
      d.scale.setScalar(1.4); scene.add(d);
      updaters.push((t) => { const a = t * 0.3 + k * 2.1; d.position.set(x + Math.cos(a) * 3, 0.25 + Math.sin(t * 2 + k) * 0.05, z + Math.sin(a) * 2.2); d.rotation.y = -a; });
    }
    const bCols = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xc77dff, 0xf77f00];
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Group();
      const ball = outline(new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), toon(bCols[k])), 1.06); ball.scale.y = 1.15; b.add(ball);
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 3), toon(0x888888)); str.position.y = -2.1; b.add(str);
      scene.add(b);
      const x0 = (rand(k * 3.3) - 0.5) * 150, z0 = (rand(k * 7.1) - 0.5) * 100;
      updaters.push((t) => { const h = ((t * 1.6 + k * 9) % 60); b.position.set(x0 + Math.sin(t * 0.5 + k) * 3, 2 + h, z0 + Math.cos(t * 0.4 + k) * 2); });
    }
  }
  if (themeId === "safari") {
    const herd = [];
    for (let k = 0; k < 7; k++) { const z = rig("zebra", 6.5); faceForward(z); herd.push({ a: z, off: k * 0.045 + rand(k) * 0.02, lane: (rand(k * 3) - 0.5) * 6 }); }
    updaters.push((t) => herd.forEach((h) => { along(h.a.root, t * 0.025 - h.off, RX + h.lane, RZ + h.lane * 0.7, 1, -0.2); walkLegs(h.a, t, 7); nearHide(h.a.root); }));
    const eles = [];
    for (let k = 0; k < 3; k++) { const e = rig("elephant", 11 - k * 2.2); faceForward(e); eles.push(e); }
    updaters.push((t) => eles.forEach((e, k) => { along(e.root, 3 - t * 0.012 - k * 0.07, RX + 8, RZ + 6, -1, -0.2); walkLegs(e, t, 3.5); nearHide(e.root, 65); }));
    const gir = [];
    for (let k = 0; k < 2; k++) { const g = rig("giraffe", 12); faceForward(g); gir.push(g); }
    updaters.push((t) => gir.forEach((g, k) => { along(g.root, 1.2 + t * 0.015 - k * 0.09, RX + 12, RZ + 9, 1, -0.2); walkLegs(g, t, 4); nearHide(g.root, 70); }));
    const jeep = new THREE.Group();
    const jb = outline(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 3.8), toon(0x7a8450)), 1.04); jb.position.y = 1.0; jeep.add(jb);
    const cab = outline(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.8), toon(0xe9dfc4)), 1.05); cab.position.set(0, 1.9, -0.3); jeep.add(cab);
    for (const x of [-1.1, 1.1]) for (const z of [-1.2, 1.2]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10), toon(0x2a2a2a)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.45, z); jeep.add(w); }
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 10), toon(0x2a2a2a)); spare.rotation.x = Math.PI / 2; spare.position.set(0, 1.1, -2.05); jeep.add(spare);
    scene.add(jeep);
    updaters.push((t) => { along(jeep, -t * 0.02 + 1, RX - 7, RZ - 6, -1, -0.15); jeep.position.y += Math.abs(Math.sin(t * 9)) * 0.08; nearHide(jeep); });
  }

  // ---------- 鏡頭 ----------
  let W = 1, H = 1, inset = { right: 0, bottom: 0 };
  let offX = 0, offY = 0, offTo = { x: 0, y: 0 };
  let tween = null, idleAt = performance.now(), active = "", searching = false;
  function resize(newInset) {
    if (newInset) inset = newInset;
    W = wrap.clientWidth || 1; H = wrap.clientHeight || 1;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    offTo = { x: inset.right / 2, y: inset.bottom / 2 };
    applyOffset();
  }
  function applyOffset() {
    if (Math.abs(offX) < 0.5 && Math.abs(offY) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(W, H, offX, offY, W, H);
    camera.updateProjectionMatrix();
  }
  function goal(cat) {
    const isl = islands.find((s) => s.c.name === cat);
    const availW = Math.max(200, W - inset.right), availH = Math.max(160, H - inset.bottom);
    const aspect = availW / availH;
    const cur = camera.position.clone().sub(controls.target);
    let az = Math.atan2(cur.x, cur.z);
    if (isl) {
      const dist = (isl.r * 5.2 + 20) / Math.min(1, aspect * 1.1);
      const el = 0.62;
      const t = new THREE.Vector3(isl.wx, 3 + raise, isl.wz);
      return { target: t, pos: t.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist)) };
    }
    az = Math.abs(az) < 0.9 ? az : 0;
    const dist = Math.max(160, 225 / aspect);
    const el = 0.64;
    const t = new THREE.Vector3(0, 0, -4);
    return { target: t, pos: t.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist)) };
  }
  function focus(cat, newInset, instant) {
    resize(newInset);
    const g = goal(cat);
    if (instant || REDUCED) {
      camera.position.copy(g.pos); controls.target.copy(g.target);
      offX = offTo.x; offY = offTo.y; applyOffset();
      tween = null; controls.update();
      return;
    }
    const d = camera.position.distanceTo(g.pos);
    tween = {
      t0: performance.now(), dur: Math.min(1900, 900 + d * 4),
      p0: camera.position.clone(), t0v: controls.target.clone(), p1: g.pos, t1: g.target,
      x0: offX, y0: offY, arc: Math.min(60, d * 0.22),
    };
    controls.enabled = false;
  }
  function update(s) {
    active = s.active; searching = s.searching;
    for (const isl of islands) {
      const c = isl.c;
      isl.sinkTo = c.dim ? 1 : 0;
      isl.opTo = c.dim ? 0.35 : 1;
      const showBadge = searching && c.hits > 0;
      if (showBadge && isl.badgeN !== c.hits) {
        isl.badge.material.map?.dispose();
        isl.badge.material.map = badgeTexture(c.hits);
        isl.badge.material.needsUpdate = true;
        isl.badgeN = c.hits;
      }
      isl.badge.visible = showBadge;
    }
    idleAt = performance.now();
  }

  // ---------- 互動 ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let hovered = null, down = null;
  function pick(ev) {
    const rect = canvas.getBoundingClientRect();
    ptr.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickables, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && !o.userData.cat) o = o.parent;
    return o ? islands.find((s) => s.root === o) : null;
  }
  canvas.addEventListener("pointermove", (ev) => {
    if (ev.pointerType === "touch") return;
    const isl = pick(ev);
    if (isl !== hovered) {
      hovered = isl;
      if (isl && window.LispAudio) window.LispAudio.sfx("call");
      canvas.classList.toggle("hover", !!isl);
      canvas.title = isl ? `${isl.c.name}（${isl.c.items.length} 支）` : "";
    }
  });
  canvas.addEventListener("pointerleave", () => { hovered = null; canvas.classList.remove("hover"); });
  canvas.addEventListener("pointerdown", (ev) => { down = { x: ev.clientX, y: ev.clientY }; });
  canvas.addEventListener("pointerup", (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) return;
    down = null;
    const isl = pick(ev);
    if (isl) App.openCat(isl.c.name);
  });
  controls.addEventListener("start", () => { idleAt = performance.now(); controls.autoRotate = false; tween = null; controls.enabled = true; });

  // ---------- 動畫 ----------
  const clock = new THREE.Clock();
  let running = true, nextShout = performance.now() + 800;
  const bobK = REDUCED ? 0.05 : T.bob;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const now = performance.now();
    if (waterMat) waterMat.uniforms.uTime.value = REDUCED ? t * 0.3 : t;

    if (tween) {
      const p = Math.min(1, (performance.now() - tween.t0) / tween.dur), e = ease(p);
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      camera.position.y += Math.sin(Math.PI * e) * tween.arc;
      controls.target.lerpVectors(tween.t0v, tween.t1, e);
      offX = tween.x0 + (offTo.x - tween.x0) * e; offY = tween.y0 + (offTo.y - tween.y0) * e;
      applyOffset();
      if (p >= 1) { tween = null; controls.enabled = true; }
    } else if (offX !== offTo.x || offY !== offTo.y) {
      offX += (offTo.x - offX) * 0.15; offY += (offTo.y - offY) * 0.15;
      if (Math.abs(offTo.x - offX) < 0.5 && Math.abs(offTo.y - offY) < 0.5) { offX = offTo.x; offY = offTo.y; }
      applyOffset();
    }
    controls.autoRotate = !REDUCED && !tween && !active && !searching && performance.now() - idleAt > 7000;
    controls.update();

    const dist = camera.position.distanceTo(controls.target);
    scene.fog.near = dist * 1.15; scene.fog.far = dist * 2.8 + 120;
    if (waterMat) { waterMat.uniforms.uFogNear.value = scene.fog.near; waterMat.uniforms.uFogFar.value = scene.fog.far; }

    for (const isl of islands) {
      isl.liftTo = hovered === isl ? 1 : 0;
      isl.lift += (isl.liftTo - isl.lift) * 0.15;
      isl.sink += (isl.sinkTo - isl.sink) * 0.08;
      isl.op += (isl.opTo - isl.op) * 0.1;
      const bob = Math.sin(t * 0.9 + isl.seed) * 0.28 * bobK;
      isl.body.position.y = bob + isl.lift * 1.2 - isl.sink * (isWater ? 1.0 : 0.6);
      isl.body.rotation.z = Math.sin(t * 0.7 + isl.seed * 2) * 0.012 * bobK;
      isl.body.rotation.x = Math.cos(t * 0.6 + isl.seed) * 0.012 * bobK;
      isl.label.material.opacity = isl.op;
      const ls = 1 + isl.lift * 0.08;
      isl.label.scale.set(isl.labelW * ls, isl.labelW * ls * 300 / 512, 1);
      const isActive = active === isl.c.name;
      isl.ring.material.opacity += ((isActive ? 0.55 + Math.sin(t * 3) * 0.25 : 0) - isl.ring.material.opacity) * 0.15;

      // 島主站在朝向鏡頭的右前方；水生島主待在岸外
      let dx = camera.position.x - isl.wx, dz = camera.position.z - isl.wz;
      const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
      const rx = dz, rz = -dx;
      const H0 = isl.hostObj;
      const water = isl.animal && isl.animal.habitat === "water";
      const far = water ? 1.32 : 0.58, fwd = water ? 0.45 : 0.22;
      H0.position.x = rx * isl.r * far + dx * isl.r * fwd;
      H0.position.z = rz * isl.r * far + dz * isl.r * fwd;
      H0.rotation.y = Math.atan2(dx, dz) - (water ? 1.1 : 0.25);

      const forced = FORCE_SHOUT.has(isl.c.name);
      const shouting = forced || (now < isl.shoutUntil && !isl.c.dim) || hovered === isl || (isActive && !REDUCED);
      isl.pop = forced ? 1 : isl.pop + ((shouting ? 1 : 0) - isl.pop) * 0.14;
      if (isl.animal) animateAnimal(isl.animal, t, shouting, isl.seed, REDUCED);
      else {
        const P = isl.person;
        if (shouting && !REDUCED) {
          P.fig.position.y = Math.abs(Math.sin(t * 7 + isl.seed)) * 0.55;
          P.armR.rotation.z = 2.5 + Math.sin(t * 14 + isl.seed) * 0.45;
          P.mouth.scale.y = 0.35 + Math.abs(Math.sin(t * 11)) * 0.9;
        } else {
          P.fig.position.y *= 0.8;
          P.armR.rotation.z += (0.12 + Math.sin(t * 1.5 + isl.seed) * 0.05 - P.armR.rotation.z) * 0.15;
          P.mouth.scale.y = shouting ? 1 : 0.35;
        }
      }
      const B = isl.bubble;
      B.visible = isl.pop > 0.02;
      if (B.visible) {
        const full = THREE.MathUtils.clamp(dist * 0.2, 15, 44), bw = full * (0.55 + 0.45 * isl.pop);
        B.scale.set(bw, bw * 260 / 640, 1);
        B.material.opacity = Math.min(1, isl.pop * 1.3);
        const off = full * 0.36;
        B.position.set(H0.position.x + rx * off, isl.hostBaseY + isl.hostH + (water ? 2.5 : 0) + full * 0.2 + 0.6, H0.position.z + rz * off);
      }
    }
    if (!REDUCED && !FORCE_SHOUT.size && now > nextShout) {
      nextShout = now + 1600;
      const busy = islands.filter((s) => now < s.shoutUntil).length;
      if (!active && busy < 3) {
        const pool = islands.filter((s) => !s.c.dim && now >= s.shoutUntil);
        const pk = pool[Math.floor(Math.random() * pool.length)];
        if (pk) pk.shoutUntil = now + 3400;
      }
    }
    sky.position.copy(camera.position);
    for (const tw of towers) tw.visible = tw.position.distanceTo(camera.position) > Math.max(150, dist * 1.05);
    for (const s of cloudShadows) {
      const u = s.userData;
      if (!REDUCED) { u.x += u.sp * dt; if (u.x > 160) u.x = -160; }
      s.position.x = u.x; s.position.z = u.z;
    }
    if (!REDUCED) {
      for (const s of swayers) { s.o.rotation.z = Math.sin(t * 1.3 + s.ph) * s.amp; s.o.rotation.x = Math.cos(t * 1.1 + s.ph) * s.amp * 0.6; }
      for (const f of foams) { const k = 1 + Math.sin(t * 1.4 + f.ph) * 0.025; f.m.scale.set(k, k, 1); f.m.material.opacity = 0.45 + Math.sin(t * 1.4 + f.ph) * 0.15; }
      const p = fluffGeo.attributes.position.array;
      for (let i = 0; i < FLUFF; i++) {
        p[i * 3] += dt * (2.2 + Math.sin(t * 0.5 + fluffSeed[i]) * 0.8);
        p[i * 3 + 1] += Math.sin(t * 1.2 + fluffSeed[i]) * dt * 0.6;
        p[i * 3 + 2] += Math.cos(t * 0.7 + fluffSeed[i]) * dt * 0.8;
        if (p[i * 3] > 110) p[i * 3] = -110;
      }
      fluffGeo.attributes.position.needsUpdate = true;
    }
    const tw = REDUCED ? t * 0.25 : t;
    for (const u of updaters) u(tw, dt);
    for (const cl of clouds) {
      const u = cl.userData;
      u.ang += u.speed * dt * (REDUCED ? 0.2 : 1);
      cl.position.set(Math.cos(u.ang) * u.rad, u.h + Math.sin(t * 0.3 + u.rad) * 0.8, Math.sin(u.ang) * u.rad * 0.7);
      cl.rotation.y = -u.ang;
    }
    const near = Math.max(70, dist * 0.8);
    for (const cl of clouds) cl.visible = cl.position.distanceTo(camera.position) > near;
    for (const b of birds) {
      const u = b.userData, a = u.ph + t * u.sp;
      b.position.set(Math.cos(a) * u.rad, u.h + Math.sin(t + u.ph) * 1.5, Math.sin(a) * u.rad * 0.6);
      b.rotation.y = -a;
      const flap = Math.sin(t * 9 + u.ph) * 0.6;
      u.l.rotation.z = flap; u.rr.rotation.z = -flap;
      b.visible = b.position.distanceTo(camera.position) > 45;
    }
    renderer.render(scene, camera);
  }

  const api = {
    theme: themeId,
    focus, update, resize,
    stop() { running = false; canvas.style.display = "none"; },
    start() { if (!running) { running = true; clock.getDelta(); frame(); } canvas.style.display = ""; },
    destroy() {
      running = false;
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
  resize();
  frame();
  return api;
}

// ---------- 啟動、2D/3D 切換、情境切換 ----------
if (App && webglOK()) {
  let view = null;
  const is3D = () => view && document.querySelector("#map3d") && document.querySelector("#map3d").style.display !== "none";
  const enable = () => {
    try {
      if (!view) view = create3D(App.theme); else view.start();
      App.use3D(view);
      viewBtn.textContent = "2D";
      viewBtn.title = "切換到 2D 地圖";
      localStorage.setItem("lispView", "3d");
    } catch (e) {
      console.error("3D 地圖無法啟動，改用 2D：", e);
      viewBtn.hidden = true;
      App.use3D(null);
    }
  };
  const disable = () => {
    if (view) view.stop();
    App.use3D(null);
    viewBtn.textContent = "3D";
    viewBtn.title = "切換到 3D 地圖";
    localStorage.setItem("lispView", "2d");
  };
  App.onTheme = (id) => {
    if (!view) return;
    const was3D = is3D();
    view.destroy(); view = null;
    if (was3D) enable(); else App.use3D(null);
  };
  viewBtn.hidden = false;
  viewBtn.addEventListener("click", () => (is3D() ? disable() : enable()));
  if (localStorage.getItem("lispView") !== "2d") enable(); else { viewBtn.textContent = "3D"; viewBtn.title = "切換到 3D 地圖"; }
}
