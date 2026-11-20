// 原創低多邊形動物模型（參數化組裝）
// buildAnimal(id, M, outline) → { root, fig, wave, waveAxis, head, legs, habitat, size }
// 角色一律面向 +Z；M(color, extra) 回傳材質，outline(mesh, k) 加描邊。
import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SPH = new THREE.SphereGeometry(1, 16, 12);
const SPH_LO = new THREE.SphereGeometry(1, 8, 6);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const CONE = new THREE.ConeGeometry(1, 1, 10);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const RING = new THREE.TorusGeometry(1, 0.07, 6, 28);
const ARC = new THREE.TorusGeometry(1, 0.13, 6, 16, Math.PI);
const HALF = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const UP = V(0, 1, 0);
const r1 = (s) => { const x = Math.sin(s * 91.7) * 43758.5453; return x - Math.floor(x); };

// 每種動物的參數（kind 決定用哪個組裝器）
const A = {
  // ---------- 四足 ----------
  elephant: { kind: "quad", c: 0x9aa0a8, L: 1.9, bh: 1.3, bw: 1.2, leg: 0.9, legT: 0.3, hs: 0.68, sn: 0, ears: "elephant", trunk: true, tusks: "fwd", tail: "thin", tuft: 0x555555, size: 1.25 },
  giraffe: { kind: "quad", c: 0xe8b84a, pattern: "spots", patC: 0x8a4f1d, L: 1.4, bh: 0.8, bw: 0.7, leg: 1.5, legT: 0.13, neck: 2.4, neckAng: 0.28, neckT: 0.17, hs: 0.36, sn: 0.38, snC: 0xf2d38a, ears: "pointy", horns: "ossicone", tail: "thin", tuft: 0x3b2a1e, mane: "strip", maneC: 0x8a4f1d, size: 1.55 },
  zebra: { kind: "quad", c: 0xf5f5f2, pattern: "stripes", patC: 0x1f1f1f, L: 1.5, bh: 0.85, bw: 0.72, leg: 0.95, neck: 0.85, neckAng: 0.55, hs: 0.4, sn: 0.45, snC: 0x2a2a2a, ears: "pointy", mane: "strip", maneC: 0x1f1f1f, tail: "thin", tuft: 0x1f1f1f },
  lion: { kind: "quad", c: 0xd9a441, L: 1.6, bh: 0.92, bw: 0.85, leg: 0.8, hs: 0.5, sn: 0.26, snC: 0xf2dca6, ears: "round", mane: 0x8a4b1a, tail: "thin", tuft: 0x8a4b1a, size: 1.1 },
  tiger: { kind: "quad", c: 0xf08a24, belly: 0xffffff, pattern: "stripes", patC: 0x1f1f1f, L: 1.75, bh: 0.85, bw: 0.8, leg: 0.75, hs: 0.5, sn: 0.24, snC: 0xffffff, ears: "round", tail: "long", tailC: 0xf08a24, size: 1.1 },
  cheetah: { kind: "quad", c: 0xe9c46a, belly: 0xfff4d6, pattern: "spots", patC: 0x222222, L: 1.7, bh: 0.7, bw: 0.6, leg: 0.95, legT: 0.12, hs: 0.4, sn: 0.2, snC: 0xfff4d6, ears: "round", tail: "long", tear: true },
  leopard: { kind: "quad", c: 0xe2a94a, belly: 0xfff0d0, pattern: "spots", patC: 0x3a2412, L: 1.65, bh: 0.8, bw: 0.7, leg: 0.8, hs: 0.45, sn: 0.22, snC: 0xfff0d0, ears: "round", tail: "long" },
  jaguar: { kind: "quad", c: 0xdc9a36, belly: 0xfff0d0, pattern: "spots", patC: 0x2a1c10, L: 1.7, bh: 0.88, bw: 0.78, leg: 0.72, hs: 0.5, sn: 0.22, snC: 0xfff0d0, ears: "round", tail: "long" },
  hippo: { kind: "quad", c: 0x8e7d93, belly: 0xd8a7b1, L: 2.0, bh: 1.2, bw: 1.2, leg: 0.5, legT: 0.32, hs: 0.7, sn: 0.6, snW: 1.5, ears: "tiny", tail: "stub", size: 1.1 },
  rhino: { kind: "quad", c: 0x9c9a94, L: 2.0, bh: 1.15, bw: 1.05, leg: 0.62, legT: 0.3, hs: 0.55, sn: 0.55, ears: "pointy", horns: "nose", tail: "thin", tuft: 0x555555, size: 1.15 },
  buffalo: { kind: "quad", c: 0x3b3330, L: 1.9, bh: 1.1, bw: 1.0, leg: 0.72, legT: 0.25, hs: 0.55, sn: 0.38, snC: 0x5a4d48, horns: "curve", hornC: 0x2a2420, ears: "pointy", tail: "thin", tuft: 0x222222, size: 1.1 },
  wildebeest: { kind: "quad", c: 0x6b6b70, L: 1.7, bh: 0.95, bw: 0.8, leg: 0.95, hs: 0.45, sn: 0.55, snC: 0x3a3a3e, horns: "curve", hornC: 0x2a2a2a, mane: "strip", maneC: 0x1f1f1f, beard: 0x1f1f1f, tail: "thin", tuft: 0x1f1f1f },
  warthog: { kind: "quad", c: 0x7a6a5a, L: 1.3, bh: 0.75, bw: 0.7, leg: 0.5, hs: 0.5, sn: 0.45, snC: 0x8a7a6a, tusks: "up", ears: "pointy", mane: "strip", maneC: 0x3b2f24, tail: "thin", tuft: 0x3b2f24, size: 0.85 },
  hyena: { kind: "quad", c: 0xb69a6b, pattern: "spots", patC: 0x4a3b2a, L: 1.45, bh: 0.82, bw: 0.7, leg: 0.88, hs: 0.46, sn: 0.36, snC: 0x3a3022, ears: "roundbig", mane: "strip", maneC: 0x4a3b2a, tail: "bushy", tailC: 0x4a3b2a },
  camel: { kind: "quad", c: 0xc9a06a, L: 1.8, bh: 0.9, bw: 0.8, leg: 1.45, legT: 0.15, neck: 1.3, neckAng: 0.95, hs: 0.38, sn: 0.5, hump: 0.6, ears: "tiny", tail: "thin", tuft: 0x8a6a40, size: 1.3 },
  capybara: { kind: "quad", c: 0x8a6a45, L: 1.5, bh: 0.95, bw: 0.85, leg: 0.42, legT: 0.2, hs: 0.5, sn: 0.45, snW: 1.1, ears: "tiny", tail: null, size: 0.85 },

  // ---------- 直立哺乳類 ----------
  gorilla: { kind: "bip", c: 0x3a3a3f, face: 0x6b6b70, belly: 0x55555b, ears: "small", armL: 1.35, chunk: 1.35, size: 1.1 },
  orangutan: { kind: "bip", c: 0xc4622d, face: 0xe8b48a, ears: "small", armL: 1.55, chunk: 1.15 },
  chimp: { kind: "bip", c: 0x3b2a22, face: 0xe0b48c, ears: "big", armL: 1.25 },
  monkey: { kind: "bip", c: 0x8a5a33, face: 0xf0c89a, belly: 0xd9b48a, ears: "big", tail: "curl", size: 0.85 },
  lemur: { kind: "bip", c: 0xa8a8a8, face: 0xffffff, eyePatch: 0x222222, ears: "pointy", tail: "ringed", tailC: 0x222222, size: 0.85 },
  sloth: { kind: "bip", c: 0x9c8466, face: 0xe8d9b8, eyePatch: 0x3b2a1e, armL: 1.45, ears: null, chunk: 1.05, sleepy: true },
  meerkat: { kind: "bip", c: 0xc9a77a, belly: 0xe8d5b0, eyePatch: 0x3b2a1e, ears: "small", tail: "thin", tailC: 0x3b2a1e, slim: 0.72, size: 0.75 },
  kangaroo: { kind: "bip", c: 0xb07a4a, belly: 0xe8c9a0, ears: "tall", tail: "thick", armL: 0.75, bigFeet: true, size: 1.15 },
  koala: { kind: "bip", c: 0x9ea3a8, belly: 0xe6e6e6, ears: "fluffy", nose: 0x2a2a2a, chunk: 1.15, size: 0.85 },
  panda: { kind: "bip", c: 0xffffff, armsC: 0x1f1f1f, legsC: 0x1f1f1f, ears: "round", earC: 0x1f1f1f, eyePatch: 0x1f1f1f, nose: 0x1f1f1f, chunk: 1.3, prop: "bamboo" },
  polarbear: { kind: "bip", c: 0xf5f5f0, ears: "small", nose: 0x1f1f1f, muzzle: 0xffffff, chunk: 1.35, size: 1.1 },
  redpanda: { kind: "bip", c: 0xc4511f, face: 0xffffff, armsC: 0x3b2016, legsC: 0x3b2016, ears: "pointy", earC: 0xffffff, tail: "ringed", tailC: 0x8a3510, size: 0.85 },
  otter: { kind: "bip", c: 0x7a5434, belly: 0xc9a37a, ears: "tiny", tail: "thick", nose: 0x1f1f1f, muzzle: 0xd9b48a, size: 0.8 },

  // ---------- 鳥 ----------
  parrot: { kind: "bird", c: 0xe63946, wing: 0x1d4ed8, wingTip: 0xffd60a, beak: [0.32, 0xf1e6c8, "hook"], legs: [0.25, 0x6b6b6b], tail: "long", tailC: 0x1d4ed8, face: 0xffffff },
  toucan: { kind: "bird", c: 0x1a1a1a, belly: 0xfff3b0, beak: [0.95, 0xff8a00, "big"], legs: [0.3, 0x4a7ab8], tail: "short", eyeRing: 0x6fd36f },
  hornbill: { kind: "bird", c: 0x2a2a2a, belly: 0xffffff, beak: [0.8, 0xf4c430, "casque"], legs: [0.3, 0x444444], tail: "long", tailC: 0xffffff },
  flamingo: { kind: "bird", c: 0xff8fab, neck: 1.5, legs: [1.8, 0xff6f91], beak: [0.38, 0xffd6e0, "bent"], tail: "short", size: 1.3 },
  penguin: { kind: "bird", c: 0x1f2a36, belly: 0xffffff, beak: [0.28, 0xffb703], legs: [0.08, 0xffb703], tail: null, upright: true, flipper: true },
  owl: { kind: "bird", c: 0x8a6a45, belly: 0xd9c4a0, beak: [0.16, 0xf4c430], legs: [0.12, 0xf4c430], bigEyes: true, tufts: true, tail: "short", round: true },
  ostrich: { kind: "bird", c: 0x222222, tailC: 0xffffff, neck: 1.6, neckC: 0xd9b0a8, head: 0xd9b0a8, legs: [1.7, 0xd99a8a], beak: [0.25, 0xe8c9a0], tail: "fluff", size: 1.45 },
  peacock: { kind: "bird", c: 0x1e5bb8, wing: 0x2a7f62, beak: [0.2, 0xd9c4a0], legs: [0.5, 0x9a8a7a], tail: "fan", crest: 0x1e5bb8, size: 1.1 },
  seagull: { kind: "bird", c: 0xffffff, wing: 0x9aa5b1, wingTip: 0x222222, beak: [0.32, 0xffc300], legs: [0.35, 0xff9f1c], tail: "short" },
  pelican: { kind: "bird", c: 0xffffff, wing: 0xe6e6e6, wingTip: 0x333333, beak: [1.0, 0xffb703, "pouch"], legs: [0.3, 0xff9f1c], tail: "short", size: 1.1 },

  // ---------- 海洋 ----------
  dolphin: { kind: "fish", form: "dolphin", c: 0x6c8ea8, belly: 0xdfe9f0, L: 2.4, habitat: "water" },
  orca: { kind: "fish", form: "orca", c: 0x15171a, belly: 0xffffff, L: 2.8, habitat: "water", size: 1.2 },
  whale: { kind: "fish", form: "whale", c: 0x3f6fa0, belly: 0xcfe0ec, L: 4.2, habitat: "water", size: 1.5 },
  shark: { kind: "fish", form: "shark", c: 0x7d8fa0, belly: 0xeef2f6, L: 2.8, habitat: "water", size: 1.15 },
  clownfish: { kind: "fish", form: "clown", c: 0xff7b00, L: 1.5, habitat: "water", size: 0.8 },
  turtle: { kind: "turtle", c: 0x5a7d3a, skin: 0x8fbf6a, habitat: "water" },
  sealion: { kind: "seal", c: 0x6b4e37, size: 1 },
  walrus: { kind: "seal", c: 0xa0705a, tusks: true, chunk: 1.3, size: 1.15 },
  octopus: { kind: "octopus", c: 0xe76f51 },
  crab: { kind: "crab", c: 0xe63946, size: 0.85 },
  starfish: { kind: "star", c: 0xff9f1c, size: 0.85 },
  jellyfish: { kind: "jelly", c: 0xffafcc, habitat: "water" },

  // ---------- 爬蟲與兩棲 ----------
  croc: { kind: "croc", c: 0x4f7a3a, belly: 0xc9d48a, size: 1.1 },
  python: { kind: "snake", c: 0x8a7a3a, patC: 0x4a3b1a },
  frog: { kind: "frog", c: 0x3fbf3f, belly: 0xd9f2a0, eye: 0xe63946, size: 0.8 },
  chameleon: { kind: "chameleon", c: 0x52b788, crestC: 0xf4a261, size: 0.85 },
};

export const ANIMAL_IDS = Object.keys(A);

export function buildAnimal(id, M, outline) {
  const o = A[id];
  if (!o) return null;

  // ---- 零件工具 ----
  const part = (p, geo, c, pos, sc, rot, ol = 1.07, extra) => {
    const m = new THREE.Mesh(geo, M(c, extra));
    m.position.set(...pos); m.scale.set(...sc);
    if (rot) m.rotation.set(...rot);
    if (ol) outline(m, ol);
    p.add(m); return m;
  };
  const limb = (p, a, b, r, c, ol = 1.12) => {
    const d = b.clone().sub(a), len = d.length();
    const m = new THREE.Mesh(CYL, M(c));
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(r, len, r);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    if (ol) outline(m, ol);
    p.add(m); return m;
  };
  const fig = new THREE.Group();
  const root = new THREE.Group(); root.add(fig);
  const rig = { root, fig, wave: null, waveAxis: "z", waveAmp: 0.6, head: null, legs: [], habitat: o.habitat || "land", size: o.size || 1 };

  if (o.kind === "quad") buildQuad(); else if (o.kind === "bip") buildBip(); else if (o.kind === "bird") buildBird();
  else if (o.kind === "fish") buildFish(); else if (o.kind === "turtle") buildTurtle(); else if (o.kind === "seal") buildSeal();
  else if (o.kind === "octopus") buildOctopus(); else if (o.kind === "crab") buildCrab(); else if (o.kind === "star") buildStar();
  else if (o.kind === "jelly") buildJelly(); else if (o.kind === "croc") buildCroc(); else if (o.kind === "snake") buildSnake();
  else if (o.kind === "frog") buildFrog(); else if (o.kind === "chameleon") buildChameleon();
  return rig;

  // ================= 四足：沿 +X 組裝，最後轉向 +Z（3/4 側面） =================
  function buildQuad() {
    const g = new THREE.Group(); fig.add(g); g.rotation.y = -Math.PI / 2 + 0.75; rig.turn = g;
    const L = o.L ?? 1.5, bh = o.bh ?? 0.85, bw = o.bw ?? 0.8, leg = o.leg ?? 0.75, lt = o.legT ?? 0.17;
    const by = leg + bh * 0.42;
    const dark = new THREE.Color(o.c).multiplyScalar(0.55).getHex();
    part(g, SPH, o.c, [0, by, 0], [L * 0.55, bh * 0.5, bw * 0.5]);
    if (o.belly) part(g, SPH, o.belly, [0, by - bh * 0.14, 0], [L * 0.47, bh * 0.36, bw * 0.44], null, 0);
    if (o.hump) part(g, SPH, o.c, [-L * 0.05, by + bh * 0.42, 0], [L * 0.24, o.hump, bw * 0.32]);
    // 斑紋
    if (o.pattern === "stripes") {
      for (let i = 0; i < 7; i++) {
        const x = -L * 0.42 + i * L * 0.14;
        const k = Math.sqrt(Math.max(0.05, 1 - (x / (L * 0.55)) ** 2));
        const ring = new THREE.Mesh(RING, M(o.patC));
        ring.position.set(x, by, 0); ring.rotation.y = Math.PI / 2;
        ring.scale.set(bw * 0.5 * k * 1.02, bh * 0.5 * k * 1.02, 1.6);
        g.add(ring);
      }
    } else if (o.pattern === "spots") {
      for (let i = 0; i < 26; i++) {
        const u = r1(i * 3.1) * Math.PI * 2, v = 0.15 + r1(i * 7.7) * 0.85;
        const s = 0.07 + r1(i * 1.3) * 0.08;
        const px = Math.cos(u) * Math.sin(v * 1.4) * L * 0.55, pz = Math.sin(u) * Math.sin(v * 1.4) * bw * 0.5;
        const py = by + Math.cos(v * 1.4) * bh * 0.5;
        part(g, SPH_LO, o.patC, [px, py, pz], [s * 1.3, s * 0.6, s * 1.3], null, 0);
      }
    }
    // 腿（可擺動）
    for (const [lx, lz, ph] of [[L * 0.33, bw * 0.24, 0], [L * 0.33, -bw * 0.24, Math.PI], [-L * 0.33, bw * 0.24, Math.PI], [-L * 0.33, -bw * 0.24, 0]]) {
      const pv = new THREE.Group(); pv.position.set(lx, leg + 0.05, lz); g.add(pv);
      part(pv, CYL, o.legC ?? o.c, [0, -leg / 2, 0], [lt, leg + 0.1, lt], null, 1.15);
      part(pv, CYL, dark, [0, -leg + 0.02, 0], [lt * 1.08, 0.14, lt * 1.08], null, 0);
      if (o.pattern === "stripes") for (let s = 0; s < 3; s++) {
        const rg = new THREE.Mesh(RING, M(o.patC)); rg.rotation.x = Math.PI / 2;
        rg.position.y = -0.15 - s * leg * 0.25; rg.scale.set(lt * 1.05, lt * 1.05, 1.5); pv.add(rg);
      }
      rig.legs.push({ o: pv, ph });
    }
    // 脖子與頭
    const hs = o.hs ?? 0.45;
    let hx = L * 0.55, hy = by + bh * 0.18;
    if (o.neck) {
      const a = o.neckAng ?? 0.6;
      const sx = L * 0.4, sy = by + bh * 0.15;
      const ex = sx + Math.sin(a) * o.neck, ey = sy + Math.cos(a) * o.neck;
      limb(g, V(sx, sy, 0), V(ex, ey, 0), o.neckT ?? 0.24, o.c);
      if (o.pattern === "spots") for (let i = 0; i < 6; i++) {
        const t = 0.15 + i * 0.14;
        part(g, SPH_LO, o.patC, [sx + (ex - sx) * t + 0.05, sy + (ey - sy) * t, (i % 2 ? 1 : -1) * (o.neckT ?? 0.24) * 0.8], [0.09, 0.09, 0.05], null, 0);
      }
      if (o.pattern === "stripes") for (let i = 0; i < 4; i++) {
        const t = 0.2 + i * 0.2;
        const rg = new THREE.Mesh(RING, M(o.patC));
        rg.position.set(sx + (ex - sx) * t, sy + (ey - sy) * t, 0);
        rg.quaternion.setFromUnitVectors(V(0, 0, 1), V(ex - sx, ey - sy, 0).normalize());
        rg.scale.set((o.neckT ?? 0.24) * 1.05, (o.neckT ?? 0.24) * 1.05, 1.5); g.add(rg);
      }
      if (o.mane === "strip") for (let i = 0; i < 7; i++) {
        const t = i / 6;
        part(g, BOX, o.maneC, [sx + (ex - sx) * t - 0.12, sy + (ey - sy) * t + 0.06, 0], [0.12, 0.2, 0.06], [0, 0, -a], 0);
      }
      hx = ex + hs * 0.35; hy = ey + hs * 0.15;
    } else if (o.mane === "strip") {
      for (let i = 0; i < 6; i++) part(g, BOX, o.maneC, [L * 0.4 - i * 0.18, by + bh * 0.5, 0], [0.14, 0.18, 0.06], null, 0);
    }
    const head = new THREE.Group(); head.position.set(hx, hy, 0); g.add(head); rig.head = head;
    if (o.mane && o.mane !== "strip") part(head, SPH, o.mane, [-hs * 0.25, -hs * 0.05, 0], [hs * 1.05, hs * 1.28, hs * 1.32]);
    part(head, SPH, o.hc ?? o.c, [0, 0, 0], [hs, hs * 0.9, hs * 0.85]);
    if (o.sn) {
      const snW = o.snW ?? 1;
      part(head, SPH, o.snC ?? o.c, [hs * 0.62 + o.sn * 0.3, -hs * 0.22, 0], [hs * 0.3 + o.sn * 0.55, hs * 0.48, hs * 0.48 * snW], null, 1.06);
      part(head, SPH_LO, 0x2a2020, [hs * 0.6 + o.sn * 0.85, -hs * 0.12, 0], [0.07, 0.06, 0.12 * snW], null, 0);
    }
    if (o.beard) part(head, CONE, o.beard, [hs * 0.3, -hs * 0.85, 0], [0.12, 0.4, 0.12], [Math.PI, 0, 0], 0);
    if (o.tear) for (const z of [-1, 1]) part(head, BOX, 0x222222, [hs * 0.62, -hs * 0.15, z * hs * 0.35], [0.03, hs * 0.5, 0.03], [0, 0, 0.3], 0);
    for (const z of [-1, 1]) {
      part(head, SPH_LO, 0x1a1a1a, [hs * 0.55, hs * 0.25, z * hs * 0.5], [hs * 0.13, hs * 0.13, hs * 0.13], null, 0);
      part(head, SPH_LO, 0xffffff, [hs * 0.64, hs * 0.31, z * hs * 0.55], [hs * 0.045, hs * 0.045, hs * 0.045], null, 0);
    }
    // 耳朵
    const earC = o.earC ?? o.c;
    if (o.ears === "pointy") for (const z of [-1, 1]) part(head, CONE, earC, [-hs * 0.15, hs * 0.85, z * hs * 0.45], [hs * 0.22, hs * 0.5, hs * 0.14], [z * 0.25, 0, 0]);
    if (o.ears === "round" || o.ears === "roundbig") { const k = o.ears === "roundbig" ? 0.36 : 0.26; for (const z of [-1, 1]) part(head, SPH, earC, [-hs * 0.15, hs * 0.75, z * hs * 0.6], [hs * k * 0.7, hs * k, hs * k * 0.5]); }
    if (o.ears === "tiny") for (const z of [-1, 1]) part(head, SPH_LO, earC, [-hs * 0.3, hs * 0.75, z * hs * 0.5], [hs * 0.14, hs * 0.14, hs * 0.1]);
    if (o.ears === "elephant") for (const z of [-1, 1]) part(head, SPH, earC, [-hs * 0.25, hs * 0.05, z * hs * 0.95], [hs * 0.75, hs * 1.0, hs * 0.12], [z * 0.25, 0, 0]);
    // 角
    const hc = o.hornC ?? 0xf0e6d0;
    if (o.horns === "ossicone") for (const z of [-1, 1]) { part(head, CYL, o.c, [-hs * 0.1, hs * 0.95, z * hs * 0.25], [0.06, 0.4, 0.06], null, 1.2); part(head, SPH_LO, 0x3b2a1e, [-hs * 0.1, hs * 1.17, z * hs * 0.25], [0.09, 0.09, 0.09], null, 0); }
    if (o.horns === "nose") { part(head, CONE, hc, [hs * 0.6 + o.sn * 0.6, hs * 0.35, 0], [0.16, 0.6, 0.16], [0, 0, -0.35]); part(head, CONE, hc, [hs * 0.4 + o.sn * 0.2, hs * 0.4, 0], [0.11, 0.32, 0.11], [0, 0, -0.25]); }
    if (o.horns === "curve") { const m = new THREE.Mesh(ARC, M(hc)); m.position.set(-hs * 0.05, hs * 0.55, 0); m.rotation.y = Math.PI / 2; m.scale.setScalar(hs * 1.15); outline(m, 1.1); head.add(m); }
    if (o.tusks) for (const z of [-1, 1]) {
      const up = o.tusks === "up";
      part(head, CONE, 0xfffbea, [hs * 0.7 + (o.sn || 0.3) * 0.4, -hs * (up ? 0.1 : 0.55), z * hs * 0.32], [0.06, up ? 0.35 : 0.55, 0.06], up ? [0, 0, -0.3] : [0, 0, -2.2]);
    }
    // 象鼻（可擺動）
    if (o.trunk) {
      const tr = new THREE.Group(); tr.position.set(hs * 0.8, -hs * 0.15, 0); head.add(tr);
      let p = V(0, 0, 0), ang = -0.35, rad = hs * 0.32;
      for (let i = 0; i < 5; i++) {
        const q = p.clone().add(V(Math.cos(ang) * 0.32, Math.sin(ang) * 0.32, 0));
        limb(tr, p, q, rad, o.c, 1.12);
        part(tr, SPH_LO, o.c, [q.x, q.y, q.z], [rad, rad, rad], null, 0);
        p = q; ang -= 0.32; rad *= 0.86;
      }
      rig.wave = tr; rig.waveAxis = "z"; rig.waveAmp = 0.5;
    }
    // 尾巴
    const tail = new THREE.Group(); tail.position.set(-L * 0.55, by + bh * 0.2, 0); g.add(tail);
    const tc = o.tailC ?? o.c;
    if (o.tail === "thin") { limb(tail, V(0, 0, 0), V(-0.25, -0.6, 0), 0.05, tc); if (o.tuft) part(tail, SPH_LO, o.tuft, [-0.27, -0.66, 0], [0.11, 0.16, 0.11], null, 0); }
    if (o.tail === "long") { limb(tail, V(0, 0, 0), V(-0.5, -0.5, 0), 0.07, tc); limb(tail, V(-0.5, -0.5, 0), V(-0.85, -0.2, 0), 0.06, tc); part(tail, SPH_LO, 0x222222, [-0.87, -0.17, 0], [0.08, 0.08, 0.08], null, 0); }
    if (o.tail === "bushy") part(tail, SPH, tc, [-0.2, -0.3, 0], [0.18, 0.4, 0.18], [0, 0, 0.5]);
    if (o.tail === "stub") part(tail, SPH_LO, tc, [-0.05, -0.05, 0], [0.1, 0.1, 0.1], null, 0);
    if (!rig.wave) { rig.wave = tail; rig.waveAxis = "y"; rig.waveAmp = 0.7; }
  }

  // ================= 直立哺乳類（猩猩、熊、袋鼠…） =================
  function buildBip() {
    const ch = o.chunk ?? 1, sl = o.slim ?? 1;
    const legH = 0.55, bodyH = 1.25 * (o.slim ? 1.15 : 1), bw = 0.62 * ch * sl;
    const armsC = o.armsC ?? o.c, legsC = o.legsC ?? o.c;
    for (const x of [-1, 1]) {
      part(fig, CYL, legsC, [x * bw * 0.45, legH / 2, 0], [0.17 * ch * sl, legH, 0.17 * ch * sl]);
      part(fig, SPH, legsC, [x * bw * 0.45, 0.08, 0.12 + (o.bigFeet ? 0.25 : 0)], [0.2 * ch, 0.12, o.bigFeet ? 0.5 : 0.26]);
    }
    const by = legH + bodyH * 0.45;
    part(fig, SPH, o.c, [0, by, 0], [bw, bodyH * 0.55, bw * 0.85]);
    if (o.belly) part(fig, SPH, o.belly, [0, by - 0.05, bw * 0.38], [bw * 0.7, bodyH * 0.42, bw * 0.5], null, 0);
    if (o.armsC && o.armsC !== o.c) part(fig, SPH, armsC, [0, by + bodyH * 0.32, 0], [bw * 1.02, bodyH * 0.2, bw * 0.87], null, 0);
    // 頭
    const hs = 0.55 * (o.chunk ? Math.min(1.2, ch) : 1);
    const hy = by + bodyH * 0.55 + hs * 0.7;
    const head = new THREE.Group(); head.position.y = hy; fig.add(head); rig.head = head;
    part(head, SPH, o.c, [0, 0, 0], [hs, hs * 0.95, hs * 0.92]);
    if (o.face) part(head, SPH, o.face, [0, -hs * 0.1, hs * 0.5], [hs * 0.7, hs * 0.62, hs * 0.5], null, 0);
    if (o.muzzle) part(head, SPH, o.muzzle, [0, -hs * 0.25, hs * 0.75], [hs * 0.4, hs * 0.3, hs * 0.35], null, 1.06);
    if (o.eyePatch) for (const x of [-1, 1]) part(head, SPH_LO, o.eyePatch, [x * hs * 0.32, hs * 0.08, hs * 0.78], [hs * 0.2, hs * 0.26, hs * 0.1], [0, 0, x * 0.4], 0);
    for (const x of [-1, 1]) {
      part(head, SPH_LO, 0x1a1a1a, [x * hs * 0.3, hs * 0.12, hs * 0.86], [hs * 0.1, o.sleepy ? hs * 0.04 : hs * 0.1, hs * 0.06], null, 0);
      if (!o.sleepy) part(head, SPH_LO, 0xffffff, [x * hs * 0.3 + 0.03, hs * 0.17, hs * 0.92], [hs * 0.035, hs * 0.035, hs * 0.03], null, 0);
    }
    part(head, SPH_LO, o.nose ?? 0x2a1f1a, [0, -hs * 0.12, hs * 0.97], [hs * (o.nose && o.ears === "fluffy" ? 0.2 : 0.11), hs * (o.ears === "fluffy" ? 0.16 : 0.08), hs * 0.08], null, 0);
    const mouth = part(head, SPH_LO, 0x7a1e1e, [0, -hs * 0.38, hs * 0.86], [hs * 0.16, hs * 0.05, hs * 0.05], null, 0);
    rig.mouth = mouth;
    const earC = o.earC ?? o.c;
    if (o.ears === "small") for (const x of [-1, 1]) part(head, SPH_LO, earC, [x * hs * 0.95, hs * 0.1, 0], [hs * 0.18, hs * 0.22, hs * 0.1]);
    if (o.ears === "big") for (const x of [-1, 1]) part(head, SPH, earC === o.c ? o.face ?? earC : earC, [x * hs * 1.0, hs * 0.1, 0], [hs * 0.3, hs * 0.34, hs * 0.1]);
    if (o.ears === "round") for (const x of [-1, 1]) part(head, SPH, earC, [x * hs * 0.7, hs * 0.75, 0], [hs * 0.3, hs * 0.3, hs * 0.16]);
    if (o.ears === "pointy") for (const x of [-1, 1]) part(head, CONE, earC, [x * hs * 0.55, hs * 0.85, 0], [hs * 0.22, hs * 0.45, hs * 0.12], [0, 0, -x * 0.3]);
    if (o.ears === "tall") for (const x of [-1, 1]) part(head, SPH, earC, [x * hs * 0.4, hs * 1.15, -hs * 0.1], [hs * 0.16, hs * 0.55, hs * 0.1], [0, 0, -x * 0.2]);
    if (o.ears === "fluffy") for (const x of [-1, 1]) part(head, SPH, earC, [x * hs * 0.95, hs * 0.5, 0], [hs * 0.45, hs * 0.42, hs * 0.18]);
    if (o.ears === "tiny") for (const x of [-1, 1]) part(head, SPH_LO, earC, [x * hs * 0.75, hs * 0.55, 0], [hs * 0.12, hs * 0.12, hs * 0.08]);
    // 手臂
    const armL = 0.95 * (o.armL ?? 1);
    const arm = (side) => {
      const pv = new THREE.Group(); pv.position.set(side * bw * 0.95, by + bodyH * 0.3, 0); fig.add(pv);
      part(pv, CYL, armsC, [0, -armL / 2, 0], [0.15 * ch, armL, 0.15 * ch]);
      part(pv, SPH_LO, o.face && o.kind === "bip" && ["gorilla", "orangutan", "chimp", "monkey"].includes(id) ? o.face : armsC, [0, -armL - 0.05, 0], [0.18 * ch, 0.16, 0.18 * ch], null, 0);
      return pv;
    };
    const aL = arm(-1), aR = arm(1);
    aL.rotation.z = -0.15; aR.rotation.z = 0.15;
    if (o.prop === "bamboo") { aL.rotation.x = -0.9; const b = new THREE.Group(); b.position.y = -armL; aL.add(b); limb(b, V(0, -0.6, 0.1), V(0, 0.9, 0.1), 0.06, 0x6fb24a); part(b, CONE, 0x4f9a3a, [0.15, 0.6, 0.1], [0.12, 0.4, 0.04], [0, 0, -0.9], 0); }
    rig.wave = aR; rig.waveAxis = "raise"; rig.armL = aL;
    // 尾巴
    const tc = o.tailC ?? o.c;
    const tail = new THREE.Group(); tail.position.set(0, by - bodyH * 0.2, -bw * 0.8); fig.add(tail);
    if (o.tail === "curl") { const m = new THREE.Mesh(ARC, M(o.c)); m.scale.setScalar(0.45); m.rotation.y = Math.PI / 2; m.position.set(0, 0.3, -0.35); outline(m, 1.1); tail.add(m); }
    if (o.tail === "ringed") for (let i = 0; i < 6; i++) part(tail, CYL, i % 2 ? tc : o.c, [0, 0.15 + i * 0.22, -0.25 - i * 0.07], [0.14, 0.23, 0.14], [-0.3, 0, 0], 1.1);
    if (o.tail === "thick") part(tail, CONE, o.c, [0, -0.25, -0.45], [0.25, 1.3, 0.25], [-1.9, 0, 0]);
    if (o.tail === "thin") limb(tail, V(0, 0, 0), V(0, 0.6, -0.4), 0.05, tc);
  }

  // ================= 鳥 =================
  function buildBird() {
    const legLen = o.legs ? o.legs[0] : 0.3;
    const legC = o.legs ? o.legs[1] : 0x777777;
    const bw = o.round ? 0.65 : 0.5, bh = o.upright ? 0.9 : (o.round ? 0.75 : 0.62);
    for (const x of [-1, 1]) {
      if (legLen > 0.1) part(fig, CYL, legC, [x * 0.16, legLen / 2, 0], [0.05, legLen, 0.05], null, 1.2);
      part(fig, SPH_LO, legC, [x * 0.16, 0.04, 0.12], [0.12, 0.05, 0.18], null, 0);
    }
    const by = legLen + bh * 0.85;
    part(fig, SPH, o.c, [0, by, 0], [bw, bh, bw * 0.95], o.upright ? null : [0.25, 0, 0]);
    if (o.belly) part(fig, SPH, o.belly, [0, by - 0.05, bw * 0.45], [bw * 0.75, bh * 0.82, bw * 0.55], null, 0);
    // 翅膀
    const wing = (x) => {
      const pv = new THREE.Group(); pv.position.set(x * bw * 0.85, by + bh * 0.3, 0); fig.add(pv);
      part(pv, SPH, o.wing ?? o.c, [x * 0.08, -bh * 0.4, -0.05], o.flipper ? [0.12, bh * 0.6, 0.3] : [0.14, bh * 0.62, bw * 0.75], [0, 0, x * 0.15]);
      if (o.wingTip) part(pv, SPH_LO, o.wingTip, [x * 0.1, -bh * 0.9, -0.1], [0.1, bh * 0.2, bw * 0.4], null, 0);
      return pv;
    };
    const wL = wing(-1), wR = wing(1);
    rig.wave = wR; rig.waveAxis = "wing"; rig.wingL = wL;
    // 脖子與頭
    let hy = by + bh * 0.95, hz = o.upright ? 0.05 : 0.2;
    const hs = o.round ? 0.5 : (o.neck ? 0.3 : 0.42);
    if (o.neck) {
      const a = V(0, by + bh * 0.6, 0.15), b = V(0, by + bh * 0.6 + o.neck, 0.35);
      limb(fig, a, b, 0.09, o.neckC ?? o.c);
      hy = b.y + hs * 0.6; hz = 0.45;
    }
    const head = new THREE.Group(); head.position.set(0, hy, hz); fig.add(head); rig.head = head;
    if (!o.round) part(head, SPH, o.head ?? o.c, [0, 0, 0], [hs, hs, hs]);
    else head.position.y = by + bh * 0.5;
    if (o.face) part(head, SPH_LO, o.face, [0, 0.02, hs * 0.55], [hs * 0.6, hs * 0.55, hs * 0.4], null, 0);
    if (o.eyeRing) for (const x of [-1, 1]) part(head, SPH_LO, o.eyeRing, [x * hs * 0.55, hs * 0.18, hs * 0.55], [hs * 0.28, hs * 0.28, hs * 0.1], null, 0);
    if (o.bigEyes) {
      for (const x of [-1, 1]) {
        part(head, SPH, 0xffffff, [x * 0.2, 0.05, 0.55], [0.2, 0.2, 0.1], null, 1.1);
        part(head, SPH_LO, 0xf4a300, [x * 0.2, 0.05, 0.62], [0.13, 0.13, 0.06], null, 0);
        part(head, SPH_LO, 0x111111, [x * 0.2, 0.05, 0.66], [0.07, 0.07, 0.04], null, 0);
      }
    } else for (const x of [-1, 1]) {
      part(head, SPH_LO, 0x111111, [x * hs * 0.55, hs * 0.18, hs * 0.62], [hs * 0.14, hs * 0.14, hs * 0.1], null, 0);
      part(head, SPH_LO, 0xffffff, [x * hs * 0.55 + 0.02, hs * 0.24, hs * 0.7], [hs * 0.05, hs * 0.05, hs * 0.04], null, 0);
    }
    if (o.tufts) for (const x of [-1, 1]) part(head, CONE, o.c, [x * 0.32, 0.5, 0.1], [0.08, 0.3, 0.06], [0, 0, -x * 0.4]);
    if (o.crest) for (let i = 0; i < 3; i++) { part(head, CYL, o.crest, [(i - 1) * 0.07, hs + 0.15, -0.05], [0.015, 0.3, 0.015], null, 0); part(head, SPH_LO, o.crest, [(i - 1) * 0.07, hs + 0.32, -0.05], [0.05, 0.05, 0.05], null, 0); }
    // 嘴
    const [bl, bc, bt] = o.beak;
    const beak = new THREE.Group(); beak.position.set(0, o.round ? -0.08 : -hs * 0.05, hs * (o.round ? 0.6 : 0.85)); head.add(beak);
    if (bt === "big" || bt === "casque") {
      part(beak, SPH, bc, [0, -0.02, bl * 0.48], [0.16, 0.2, bl * 0.55]);
      part(beak, SPH_LO, 0x1a1a1a, [0, -0.02, bl * 0.97], [0.06, 0.08, 0.06], null, 0);
      if (bt === "casque") part(beak, SPH, 0xf9844a, [0, 0.2, bl * 0.25], [0.11, 0.12, bl * 0.35]);
    } else if (bt === "pouch") {
      part(beak, BOX, bc, [0, 0, bl * 0.5], [0.16, 0.08, bl]);
      part(beak, SPH, 0xffd166, [0, -0.17, bl * 0.42], [0.14, 0.17, bl * 0.42]);
    } else {
      const b = part(beak, CONE, bc, [0, 0, bl * 0.5], [0.09 + bl * 0.12, bl, 0.09 + bl * 0.12], [Math.PI / 2, 0, 0], 1.12);
      if (bt === "hook" || bt === "bent") b.rotation.x = Math.PI / 2 + 0.5;
      if (bt === "bent") part(beak, CONE, 0x222222, [0, -0.15, bl * 0.9], [0.06, 0.18, 0.06], [Math.PI, 0, 0], 0);
    }
    // 尾巴
    if (o.tail === "long") part(fig, CONE, o.tailC ?? o.c, [0, by - bh * 0.6, -bw * 0.9], [0.14, 1.1, 0.1], [-2.6, 0, 0]);
    if (o.tail === "short") part(fig, CONE, o.tailC ?? o.c, [0, by - bh * 0.3, -bw * 0.9], [0.18, 0.5, 0.08], [-2.2, 0, 0]);
    if (o.tail === "fluff") part(fig, SPH, o.tailC, [0, by + 0.1, -bw * 0.9], [0.4, 0.35, 0.3]);
    if (o.tail === "fan") {
      const fan = new THREE.Group(); fan.position.set(0, by, -bw * 0.8); fig.add(fan);
      for (let i = 0; i < 13; i++) {
        const a = -1.35 + i * (2.7 / 12);
        const f = new THREE.Group(); f.rotation.z = a; fan.add(f);
        part(f, SPH, 0x2a9d5c, [0, 1.15, 0], [0.22, 1.2, 0.04], null, 1.05);
        part(f, SPH_LO, 0xf4c430, [0, 1.95, 0.03], [0.16, 0.16, 0.03], null, 0);
        part(f, SPH_LO, 0x1d4ed8, [0, 1.95, 0.05], [0.09, 0.09, 0.03], null, 0);
      }
      rig.fan = fan;
    }
  }

  // ================= 海豚、鯨魚、鯊魚、小丑魚（沿 +Z） =================
  function buildFish() {
    const L = o.L, f = o.form;
    const bw = f === "whale" ? 0.9 : f === "clown" ? 0.38 : 0.5, bh = f === "whale" ? 0.85 : f === "clown" ? 0.5 : 0.5;
    const g = new THREE.Group(); fig.add(g); g.position.y = bh;
    part(g, SPH, o.c, [0, 0, 0], [bw, bh, L * 0.5]);
    if (o.belly) part(g, SPH, o.belly, [0, -bh * 0.35, L * 0.05], [bw * 0.8, bh * 0.6, L * 0.42], null, 0);
    if (f === "orca") { for (const x of [-1, 1]) part(g, SPH_LO, 0xffffff, [x * bw * 0.6, bh * 0.25, L * 0.3], [0.12, 0.1, 0.25], null, 0); part(g, SPH_LO, 0xd9d9d9, [0, bh * 0.6, -L * 0.1], [bw * 0.5, 0.12, 0.35], null, 0); }
    if (f === "clown") for (const z of [-0.35, 0, 0.35]) { const rg = new THREE.Mesh(RING, M(0xffffff)); rg.position.z = z * L; rg.scale.set(bw * 1.0, bh * 1.0, 2.5); g.add(rg); }
    if (f === "dolphin") part(g, CONE, o.c, [0, -bh * 0.15, L * 0.55], [0.15, 0.4, 0.15], [Math.PI / 2, 0, 0]);
    // 眼睛與嘴
    for (const x of [-1, 1]) {
      part(g, SPH_LO, 0x111111, [x * bw * 0.72, bh * 0.15, L * 0.33], [0.08, 0.08, 0.06], null, 0);
      part(g, SPH_LO, 0xffffff, [x * bw * 0.76, bh * 0.2, L * 0.35], [0.03, 0.03, 0.02], null, 0);
    }
    if (f === "shark") part(g, BOX, 0x333333, [0, -bh * 0.35, L * 0.38], [bw * 0.8, 0.04, 0.15], null, 0);
    if (f === "whale") for (let i = 0; i < 5; i++) part(g, BOX, 0x9fb8cc, [0, -bh * 0.75, L * (0.1 + i * 0.06)], [bw * 0.7, 0.03, 0.03], null, 0);
    // 背鰭
    if (f !== "whale") part(g, CONE, o.c, [0, bh * (f === "clown" ? 0.9 : 1.05), -L * 0.05], f === "orca" ? [0.1, 0.9, 0.35] : [0.08, 0.55, 0.3], [-0.3, 0, 0]);
    // 胸鰭（可擺動）
    const flip = (x) => { const pv = new THREE.Group(); pv.position.set(x * bw * 0.8, -bh * 0.2, L * 0.15); g.add(pv); part(pv, SPH, o.c, [x * 0.25, -0.05, 0], [0.32, 0.06, 0.18], [0, 0, x * -0.4]); return pv; };
    const fL = flip(-1), fR = flip(1);
    rig.wave = fR; rig.waveAxis = "fin"; rig.finL = fL;
    // 尾鰭
    const tail = new THREE.Group(); tail.position.set(0, 0, -L * 0.5); g.add(tail);
    if (f === "clown") part(tail, SPH, o.c, [0, 0, -0.15], [0.05, 0.35, 0.25]);
    else if (f === "shark") { part(tail, CONE, o.c, [0, 0.35, -0.2], [0.07, 0.8, 0.22], [-0.7, 0, 0]); part(tail, CONE, o.c, [0, -0.2, -0.15], [0.06, 0.45, 0.18], [-2.4, 0, 0]); }
    else for (const x of [-1, 1]) part(tail, SPH, o.c, [x * 0.35, 0, -0.18], [0.42, 0.06, 0.2], [0, x * 0.4, 0]);
    rig.tail = tail;
    rig.fishLen = L;
  }

  function buildTurtle() {
    const g = new THREE.Group(); fig.add(g); g.position.y = 0.35;
    part(g, HALF, o.c, [0, 0, 0], [1.0, 0.65, 1.15]);
    part(g, CYL, 0xc9b26b, [0, 0, 0], [1.02, 0.08, 1.17], null, 0);
    for (let i = 0; i < 6; i++) { const a = i * 1.047; part(g, SPH_LO, 0x3f5c28, [Math.cos(a) * 0.5, 0.48, Math.sin(a) * 0.55], [0.2, 0.06, 0.2], null, 0); }
    part(g, SPH_LO, 0x3f5c28, [0, 0.66, 0], [0.24, 0.05, 0.24], null, 0);
    const head = new THREE.Group(); head.position.set(0, 0.15, 1.2); g.add(head); rig.head = head;
    part(head, SPH, o.skin, [0, 0, 0.1], [0.32, 0.28, 0.38]);
    for (const x of [-1, 1]) part(head, SPH_LO, 0x111111, [x * 0.22, 0.08, 0.3], [0.06, 0.06, 0.05], null, 0);
    const flip = (x, z, s) => { const pv = new THREE.Group(); pv.position.set(x * 0.85, -0.02, z); g.add(pv); part(pv, SPH, o.skin, [x * 0.35, 0, 0], [0.45 * s, 0.07, 0.22 * s], [0, x * 0.4, 0]); return pv; };
    const fR = flip(1, 0.55, 1), fL = flip(-1, 0.55, 1); flip(1, -0.6, 0.7); flip(-1, -0.6, 0.7);
    rig.wave = fR; rig.waveAxis = "fin"; rig.finL = fL;
  }

  function buildSeal() {
    const ch = o.chunk ?? 1;
    part(fig, SPH, o.c, [0, 0.55, -0.4], [0.6 * ch, 0.45, 0.85]);
    part(fig, SPH, o.c, [0, 1.15, 0.1], [0.55 * ch, 0.75, 0.5 * ch], [-0.3, 0, 0]);
    const head = new THREE.Group(); head.position.set(0, 1.95, 0.35); fig.add(head); rig.head = head;
    part(head, SPH, o.c, [0, 0, 0], [0.42 * ch, 0.4, 0.42]);
    part(head, SPH, new THREE.Color(o.c).offsetHSL(0, 0, 0.12).getHex(), [0, -0.12, 0.35], [0.25 * ch, 0.18, 0.2], null, 1.06);
    part(head, SPH_LO, 0x1a1a1a, [0, -0.02, 0.52], [0.07, 0.05, 0.05], null, 0);
    for (const x of [-1, 1]) {
      part(head, SPH_LO, 0x111111, [x * 0.2, 0.12, 0.33], [0.07, 0.08, 0.05], null, 0);
      for (let k = 0; k < 2; k++) part(head, BOX, 0x2a2a2a, [x * 0.33, -0.14 - k * 0.05, 0.42], [0.25, 0.012, 0.012], [0, 0, x * (0.1 + k * 0.15)], 0);
      if (o.tusks) part(head, CONE, 0xfffbea, [x * 0.12, -0.5, 0.42], [0.06, 0.55, 0.06], [Math.PI, 0, 0]);
    }
    const flip = (x) => { const pv = new THREE.Group(); pv.position.set(x * 0.5 * ch, 0.9, 0.25); fig.add(pv); part(pv, SPH, o.c, [x * 0.2, -0.3, 0.1], [0.14, 0.45, 0.25], [0, 0, x * 0.4]); return pv; };
    const fR = flip(1); flip(-1);
    for (const x of [-1, 1]) part(fig, SPH, o.c, [x * 0.3, 0.12, -1.15], [0.28, 0.06, 0.35], [0, x * 0.5, 0]);
    rig.wave = fR; rig.waveAxis = "raise";
  }

  function buildOctopus() {
    const head = new THREE.Group(); head.position.y = 1.25; fig.add(head); rig.head = head;
    part(head, SPH, o.c, [0, 0.25, -0.1], [0.75, 0.9, 0.8]);
    for (const x of [-1, 1]) {
      part(head, SPH, 0xffffff, [x * 0.3, -0.05, 0.62], [0.2, 0.22, 0.1], null, 1.1);
      part(head, SPH_LO, 0x111111, [x * 0.3, -0.05, 0.7], [0.1, 0.12, 0.05], null, 0);
    }
    part(head, SPH_LO, 0xa83a2a, [0, -0.35, 0.68], [0.12, 0.08, 0.08], null, 0);
    const tents = new THREE.Group(); tents.position.y = 0.55; fig.add(tents);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const t = new THREE.Group(); t.rotation.y = a; tents.add(t);
      let p = V(0, 0, 0.35);
      for (let k = 0; k < 4; k++) {
        const q = p.clone().add(V(0, -0.15 + k * 0.05, 0.28));
        limb(t, p, q, 0.14 - k * 0.025, o.c, 1.12);
        p = q;
      }
      part(t, SPH_LO, o.c, [p.x, p.y, p.z], [0.06, 0.06, 0.06], null, 0);
    }
    rig.wave = tents; rig.waveAxis = "spin"; rig.waveAmp = 0.35;
  }

  function buildCrab() {
    const g = new THREE.Group(); fig.add(g); g.position.y = 0.6;
    part(g, SPH, o.c, [0, 0, 0], [0.85, 0.42, 0.65]);
    for (const x of [-1, 1]) {
      limb(g, V(x * 0.2, 0.3, 0.35), V(x * 0.25, 0.75, 0.45), 0.05, o.c);
      part(g, SPH, 0xffffff, [x * 0.25, 0.82, 0.45], [0.12, 0.12, 0.12], null, 1.1);
      part(g, SPH_LO, 0x111111, [x * 0.25, 0.84, 0.55], [0.06, 0.06, 0.04], null, 0);
      for (let k = 0; k < 3; k++) limb(g, V(x * 0.6, -0.05, -0.2 + k * 0.2), V(x * 1.1, -0.6, -0.3 + k * 0.25), 0.05, o.c);
    }
    const claw = (x) => {
      const pv = new THREE.Group(); pv.position.set(x * 0.7, 0.1, 0.35); g.add(pv);
      limb(pv, V(0, 0, 0), V(x * 0.35, 0.35, 0.2), 0.08, o.c);
      part(pv, SPH, o.c, [x * 0.45, 0.55, 0.28], [0.25, 0.3, 0.18]);
      part(pv, CONE, o.c, [x * 0.5, 0.85, 0.3], [0.1, 0.3, 0.08], [0, 0, -x * 0.3]);
      return pv;
    };
    const cR = claw(1), cL = claw(-1);
    rig.wave = cR; rig.waveAxis = "claw"; rig.finL = cL; rig.head = g;
  }

  function buildStar() {
    const g = new THREE.Group(); g.position.y = 1.15; fig.add(g); rig.head = g;
    part(g, SPH, o.c, [0, 0, 0], [0.45, 0.45, 0.2]);
    const arms = [];
    for (let i = 0; i < 5; i++) {
      const pv = new THREE.Group(); pv.rotation.z = (i / 5) * Math.PI * 2; g.add(pv);
      part(pv, CONE, o.c, [0, 0.62, 0], [0.3, 0.9, 0.16]);
      arms.push(pv);
    }
    for (let i = 0; i < 10; i++) part(g, SPH_LO, 0xffd166, [Math.cos(i) * 0.3, Math.sin(i * 1.7) * 0.3, 0.18], [0.04, 0.04, 0.03], null, 0);
    for (const x of [-1, 1]) {
      part(g, SPH, 0xffffff, [x * 0.15, 0.1, 0.17], [0.1, 0.12, 0.05], null, 1.1);
      part(g, SPH_LO, 0x111111, [x * 0.15, 0.1, 0.21], [0.05, 0.06, 0.03], null, 0);
    }
    rig.wave = arms[1]; rig.waveAxis = "starArm";
  }

  function buildJelly() {
    const g = new THREE.Group(); g.position.y = 1.0; fig.add(g); rig.head = g;
    part(g, HALF, o.c, [0, 0, 0], [0.85, 0.75, 0.85], null, 1.05, { transparent: true, opacity: 0.85 });
    part(g, CYL, 0xffd6e5, [0, 0, 0], [0.86, 0.05, 0.86], null, 0);
    for (const x of [-1, 1]) part(g, SPH_LO, 0x5a2a3a, [x * 0.25, 0.35, 0.68], [0.06, 0.07, 0.04], null, 0);
    const tents = new THREE.Group(); g.add(tents);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, rr = 0.55;
      const t = new THREE.Group(); t.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); tents.add(t);
      for (let k = 0; k < 4; k++) part(t, CYL, 0xffc8dd, [Math.sin(k) * 0.06, -0.2 - k * 0.22, 0], [0.03, 0.24, 0.03], null, 0);
    }
    rig.wave = tents; rig.waveAxis = "spin"; rig.waveAmp = 0.5;
  }

  // ================= 鱷魚（沿 +X 後轉向） =================
  function buildCroc() {
    const g = new THREE.Group(); fig.add(g); g.rotation.y = -Math.PI / 2 + 0.75; rig.turn = g;
    part(g, SPH, o.c, [0, 0.45, 0], [1.2, 0.35, 0.55]);
    part(g, SPH, o.belly, [0, 0.35, 0], [1.1, 0.25, 0.5], null, 0);
    for (let i = 0; i < 8; i++) part(g, CONE, new THREE.Color(o.c).multiplyScalar(0.7).getHex(), [-0.9 + i * 0.25, 0.78, 0], [0.08, 0.15, 0.08], null, 0);
    const tailG = new THREE.Group(); tailG.position.set(-1.1, 0.45, 0); g.add(tailG);
    part(tailG, CONE, o.c, [-0.8, 0, 0], [0.3, 1.8, 0.25], [0, 0, Math.PI / 2]);
    for (const [x, z] of [[0.6, 0.45], [0.6, -0.45], [-0.6, 0.45], [-0.6, -0.45]]) {
      const pv = new THREE.Group(); pv.position.set(x, 0.35, z); g.add(pv);
      limb(pv, V(0, 0, 0), V(0, -0.35, z * 0.4), 0.1, o.c);
      rig.legs.push({ o: pv, ph: x > 0 ? 0 : Math.PI });
    }
    const head = new THREE.Group(); head.position.set(1.15, 0.5, 0); g.add(head); rig.head = head;
    part(head, BOX, o.c, [0.55, -0.12, 0], [1.1, 0.16, 0.45]);
    const jaw = new THREE.Group(); jaw.position.set(0, 0.0, 0); head.add(jaw);
    part(jaw, BOX, o.c, [0.55, 0.05, 0], [1.15, 0.18, 0.5]);
    for (let i = 0; i < 6; i++) for (const z of [-1, 1]) part(jaw, CONE, 0xffffff, [0.15 + i * 0.17, -0.07, z * 0.22], [0.035, 0.09, 0.035], [Math.PI, 0, 0], 0);
    for (const z of [-1, 1]) {
      part(head, SPH, o.c, [0.05, 0.25, z * 0.17], [0.13, 0.13, 0.13]);
      part(head, SPH_LO, 0xffd166, [0.12, 0.29, z * 0.17], [0.07, 0.08, 0.07], null, 0);
      part(head, SPH_LO, 0x111111, [0.17, 0.3, z * 0.17], [0.025, 0.07, 0.03], null, 0);
    }
    rig.wave = jaw; rig.waveAxis = "jaw";
  }

  function buildSnake() {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.75 - i * 0.18, 0.2 - i * 0.02, 8, 24), M(o.c));
      m.rotation.x = Math.PI / 2; m.position.y = 0.2 + i * 0.32; outline(m, 1.06); fig.add(m);
    }
    for (let i = 0; i < 14; i++) { const a = i * 0.9; part(fig, SPH_LO, o.patC, [Math.cos(a) * (0.75 - (i % 3) * 0.18), 0.32 + (i % 3) * 0.32, Math.sin(a) * (0.75 - (i % 3) * 0.18)], [0.09, 0.05, 0.09], null, 0); }
    const neck = new THREE.Group(); neck.position.set(0, 0.9, 0); fig.add(neck);
    limb(neck, V(0, 0, 0), V(0, 0.9, 0.25), 0.15, o.c);
    const head = new THREE.Group(); head.position.set(0, 1.05, 0.4); neck.add(head); rig.head = head;
    part(head, SPH, o.c, [0, 0, 0], [0.28, 0.2, 0.38]);
    for (const x of [-1, 1]) { part(head, SPH_LO, 0xffd166, [x * 0.17, 0.08, 0.15], [0.07, 0.07, 0.06], null, 0); part(head, SPH_LO, 0x111111, [x * 0.19, 0.09, 0.18], [0.025, 0.06, 0.03], null, 0); }
    part(head, BOX, 0xe63946, [0, -0.05, 0.5], [0.04, 0.02, 0.3], null, 0);
    rig.wave = neck; rig.waveAxis = "sway";
  }

  function buildFrog() {
    part(fig, SPH, o.c, [0, 0.55, 0], [0.75, 0.5, 0.7]);
    part(fig, SPH, o.belly, [0, 0.45, 0.35], [0.55, 0.38, 0.4], null, 0);
    const head = new THREE.Group(); head.position.y = 0.85; fig.add(head); rig.head = head;
    for (const x of [-1, 1]) {
      part(head, SPH, o.c, [x * 0.35, 0.25, 0.25], [0.24, 0.24, 0.24]);
      part(head, SPH_LO, o.eye, [x * 0.38, 0.3, 0.42], [0.15, 0.15, 0.1], null, 0);
      part(head, SPH_LO, 0x111111, [x * 0.38, 0.3, 0.5], [0.04, 0.12, 0.03], null, 0);
      part(fig, SPH, o.c, [x * 0.6, 0.25, -0.2], [0.3, 0.25, 0.45]);
      part(fig, SPH_LO, 0xf4a261, [x * 0.7, 0.03, 0.15], [0.18, 0.04, 0.22], null, 0);
    }
    part(head, BOX, 0x1f4d1f, [0, -0.05, 0.62], [0.5, 0.03, 0.03], null, 0);
    const arm = (x) => { const pv = new THREE.Group(); pv.position.set(x * 0.45, 0.45, 0.4); fig.add(pv); limb(pv, V(0, 0, 0), V(x * 0.1, -0.4, 0.1), 0.08, o.c); part(pv, SPH_LO, 0xf4a261, [x * 0.1, -0.42, 0.12], [0.1, 0.05, 0.1], null, 0); return pv; };
    const aR = arm(1); arm(-1);
    rig.wave = aR; rig.waveAxis = "raise";
  }

  function buildChameleon() {
    const g = new THREE.Group(); fig.add(g); g.rotation.y = -Math.PI / 2 + 0.75; rig.turn = g;
    part(g, SPH, o.c, [0, 0.9, 0], [0.8, 0.5, 0.35]);
    for (let i = 0; i < 6; i++) part(g, CONE, o.crestC, [-0.6 + i * 0.22, 1.42, 0], [0.07, 0.18, 0.05], null, 0);
    const tail = new THREE.Group(); tail.position.set(-0.75, 0.8, 0); g.add(tail);
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 6, 16, Math.PI * 1.6), M(o.c)); m.position.set(-0.2, -0.25, 0); m.rotation.z = 1.2; outline(m, 1.1); tail.add(m);
    for (const [x, z] of [[0.45, 0.25], [0.45, -0.25], [-0.45, 0.25], [-0.45, -0.25]]) limb(g, V(x, 0.7, z), V(x + 0.1, 0, z * 1.3), 0.08, o.c);
    const head = new THREE.Group(); head.position.set(0.8, 1.0, 0); g.add(head); rig.head = head;
    part(head, CONE, o.c, [0.15, 0, 0], [0.38, 0.6, 0.3], [0, 0, -Math.PI / 2]);
    for (const z of [-1, 1]) { part(head, SPH, o.c, [0.05, 0.12, z * 0.2], [0.14, 0.14, 0.14]); part(head, SPH_LO, 0x111111, [0.12, 0.14, z * 0.3], [0.05, 0.05, 0.04], null, 0); }
    rig.wave = tail; rig.waveAxis = "curl";
  }
}

// 每一幀的動作：shouting=true 時大動作
export function animateAnimal(rig, t, shouting, seed, reduced) {
  const s = shouting && !reduced;
  const w = rig.wave;
  const k = Math.sin(t * 12 + seed);
  if (rig.habitat === "water") {
    // 在水裡：喊的時候跳出水面
    const jump = s ? Math.max(0, Math.sin(t * 3.2 + seed)) : 0;
    rig.fig.position.y += ((s ? jump * 2.2 : Math.sin(t * 1.5 + seed) * 0.15) - rig.fig.position.y) * 0.25;
    rig.fig.rotation.x = s ? -Math.cos(t * 3.2 + seed) * 0.5 : 0;
  } else {
    rig.fig.position.y = s ? Math.abs(Math.sin(t * 7 + seed)) * 0.5 : rig.fig.position.y * 0.8;
  }
  if (rig.head) rig.head.rotation.z = s ? Math.sin(t * 9 + seed) * 0.12 : Math.sin(t * 1.3 + seed) * 0.04;
  if (!w) return;
  const ax = rig.waveAxis;
  if (ax === "raise") w.rotation.z = s ? 2.5 + k * 0.45 : w.rotation.z + (0.15 - w.rotation.z) * 0.15;
  else if (ax === "wing") { const a = s ? 0.6 + Math.sin(t * 18 + seed) * 0.6 : 0; w.rotation.z = a; if (rig.wingL) rig.wingL.rotation.z = -a; }
  else if (ax === "fin" || ax === "claw") { const a = s ? Math.sin(t * 10 + seed) * 0.6 : Math.sin(t * 2 + seed) * 0.1; w.rotation.z = (ax === "claw" ? 0.4 : 0) + a; if (rig.finL) rig.finL.rotation.z = -a; }
  else if (ax === "y") w.rotation.y = Math.sin(t * (s ? 14 : 2) + seed) * (s ? 0.7 : 0.25);
  else if (ax === "z") w.rotation.z = s ? Math.sin(t * 8 + seed) * 0.5 + 0.3 : Math.sin(t * 1.5 + seed) * 0.1;
  else if (ax === "spin") w.rotation.y += s ? 0.06 : 0.008;
  else if (ax === "jaw") w.rotation.z = s ? Math.abs(Math.sin(t * 8 + seed)) * 0.45 : 0;
  else if (ax === "sway") w.rotation.z = Math.sin(t * (s ? 6 : 1.2) + seed) * (s ? 0.35 : 0.1);
  else if (ax === "curl") w.rotation.z = s ? Math.sin(t * 6) * 0.4 : 0;
  else if (ax === "starArm") w.rotation.x = s ? Math.sin(t * 10) * 0.6 : 0;
  if (rig.fan) rig.fan.scale.setScalar(s ? 1.15 : 0.85);
}

// 走路時擺動腿
export function walkLegs(rig, t, speed = 8) {
  for (const l of rig.legs) l.o.rotation.z = Math.sin(t * speed + l.ph) * 0.45;
}

// 走動的動物要正面朝向前進方向（四足類原本是 3/4 側面）
export function faceForward(rig) { if (rig.turn) rig.turn.rotation.y = -Math.PI / 2; }
