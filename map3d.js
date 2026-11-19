// LISP 分類島導覽 — 3D 島嶼地圖（Three.js）
// 不支援 WebGL 或載入失敗時，網頁會自動保留 2D 地圖。
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const App = window.LispApp;
const wrap = document.querySelector(".map-wrap");
const viewBtn = document.querySelector("#viewBtn");
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LAND = [0x6dbb63, 0x79c46a, 0x5fae5f, 0x82c26b, 0x68b870, 0x74bd5c];
const SKY_TOP = new THREE.Color(0x5fb4dc), SKY_HORIZON = new THREE.Color(0xcdeaf3);

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
  x.font = 'bold 66px "Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
  x.lineJoin = "round"; x.lineWidth = 12; x.strokeStyle = "rgba(10,40,30,.8)";
  x.strokeText(name, 256, 192); x.fillStyle = "#fff"; x.fillText(name, 256, 192);
  x.font = '40px "Noto Sans TC","Microsoft JhengHei",sans-serif';
  x.lineWidth = 9; x.strokeText(count, 256, 262); x.fillText(count, 256, 262);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function badgeTexture(n) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "#e8743b"; x.strokeStyle = "#fff"; x.lineWidth = 10;
  x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.fill(); x.stroke();
  x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `bold ${n > 99 ? 46 : 58}px sans-serif`;
  x.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 場景 ----------
function create3D() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.id = "map3d";
  canvas.setAttribute("aria-label", "LISP 分類島嶼 3D 地圖，可拖曳旋轉");
  wrap.insertBefore(canvas, wrap.firstChild);

  const scene = new THREE.Scene();
  {
    const c = document.createElement("canvas"); c.width = 2; c.height = 256;
    const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#" + SKY_TOP.getHexString()); g.addColorStop(0.75, "#" + SKY_HORIZON.getHexString());
    x.fillStyle = g; x.fillRect(0, 0, 2, 256);
    scene.background = new THREE.CanvasTexture(c);
    scene.background.colorSpace = THREE.SRGBColorSpace;
  }
  scene.fog = new THREE.Fog(SKY_HORIZON, 200, 500);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
  camera.position.set(0, 130, 120);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.32;
  controls.minDistance = 18;
  controls.maxDistance = 520;
  controls.screenSpacePanning = false;
  controls.autoRotateSpeed = 0.35;

  scene.add(new THREE.HemisphereLight(0xdff4ff, 0x2b6a55, 1.25));
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.3);
  sun.position.set(-60, 110, 50);
  scene.add(sun);

  // ---------- 海面 ----------
  const waterGeo = new THREE.PlaneGeometry(900, 900, 220, 220);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uAmp: { value: REDUCED ? 0.35 : 1 },
      uDeep: { value: new THREE.Color(0x0b4f73) }, uShallow: { value: new THREE.Color(0x2aa3c4) },
      uSky: { value: SKY_HORIZON.clone() }, uSun: { value: sun.position.clone().normalize() },
      uFogColor: { value: SKY_HORIZON.clone() }, uFogNear: { value: 200 }, uFogFar: { value: 500 },
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
        float fres = pow(1.-max(dot(n,v),0.),3.);
        vec3 col = mix(uDeep, uShallow, .25+.55*diff);
        col = mix(col, uSky, fres*.55);
        col += vec3(1.,.95,.85)*pow(max(dot(reflect(-uSun,n),v),0.),90.)*.9;
        col += vec3(1.)*smoothstep(.45,.75,vH)*.18;
        float f = smoothstep(uFogNear, uFogFar, length(cameraPosition - vW));
        gl_FragColor = vec4(mix(col, uFogColor, f), 1.);
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  scene.add(water);

  // ---------- 島嶼 ----------
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xf1dca2, roughness: 0.95, flatShading: true });
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x4c9a49, roughness: 0.9, flatShading: true });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9c9384, roughness: 1, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 1, flatShading: true });
  const leafMats = [0x2f7a3a, 0x3d8f46, 0x2a6e44].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }));
  const palmMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.6, 5);
  const coneGeo = new THREE.ConeGeometry(1, 2.4, 6);
  const ballGeo = new THREE.IcosahedronGeometry(1, 0);

  function tree(rnd) {
    const g = new THREE.Group();
    const s = 0.7 + rnd * 0.6;
    const t = new THREE.Mesh(trunkGeo, trunkMat); t.position.y = 0.8; g.add(t);
    const leaf = leafMats[Math.floor(rnd * 3) % 3];
    if (rnd > 0.45) {
      const c1 = new THREE.Mesh(coneGeo, leaf); c1.position.y = 2.2; c1.scale.set(1, 1, 1); g.add(c1);
      const c2 = new THREE.Mesh(coneGeo, leaf); c2.position.y = 3.1; c2.scale.setScalar(0.72); g.add(c2);
    } else {
      const b = new THREE.Mesh(ballGeo, leaf); b.position.y = 2.2; b.scale.set(1.2, 1.1, 1.2); g.add(b);
    }
    g.scale.setScalar(s);
    g.rotation.y = rnd * 6.28;
    return g;
  }
  function palm(rnd) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 5), trunkMat);
    trunk.position.y = 1.6; trunk.rotation.z = 0.18; g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const pivot = new THREE.Group(); pivot.position.set(0.3, 3.15, 0); pivot.rotation.y = (i / 5) * Math.PI * 2 + rnd;
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.3, 3), palmMat);
      l.rotation.z = -Math.PI / 2 - 0.45; l.position.x = 1.0; l.scale.z = 0.35;
      pivot.add(l); g.add(pivot);
    }
    g.scale.setScalar(0.8 + rnd * 0.3);
    return g;
  }

  const islands = [];
  const pickables = [];
  App.catList.forEach((c, i) => {
    const r = c.r / 10;               // 2D 半徑 → 3D 單位
    const wx = (c.x - 800) / 10, wz = (c.y - 550) / 10;
    const seed = c.seed;
    const root = new THREE.Group();   // 位置與互動
    root.position.set(wx, 0, wz);
    const body = new THREE.Group();   // 浮動、升降
    root.add(body);

    // 淺灘
    const shallow = new THREE.Mesh(new THREE.ShapeGeometry(blobShape(r * 1.32, seed, 0.1)),
      new THREE.MeshBasicMaterial({ color: 0x8fe3ee, transparent: true, opacity: 0.45, depthWrite: false }));
    shallow.rotation.x = -Math.PI / 2; shallow.position.y = 0.42;
    root.add(shallow);

    // 沙灘 + 草地
    const sand = new THREE.Mesh(flatExtrude(blobShape(r, seed), 1.4, 0.6), sandMat);
    sand.position.y = -1.6; body.add(sand);
    const landMat = new THREE.MeshStandardMaterial({ color: LAND[i % LAND.length], roughness: 0.9, flatShading: true });
    const land = new THREE.Mesh(flatExtrude(blobShape(r * 0.82, seed + 0.5), 0.6, 0.45), landMat);
    land.position.set(0, 0.25, 0); body.add(land);
    const top = 1.3;

    // 山丘
    const hills = 1 + Math.round(r / 6);
    for (let h = 0; h < hills; h++) {
      const hs = r * (0.28 + rand(seed + h * 5) * 0.14);
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(hs, 1), hillMat);
      const a = rand(seed + h) * 6.28, d = r * 0.25 * rand(seed + h * 2);
      hill.position.set(Math.cos(a) * d - r * 0.1, top - hs * 0.35, Math.sin(a) * d * 0.8 - r * 0.15);
      hill.scale.y = 0.55;
      body.add(hill);
    }
    // 岩石
    for (let k = 0; k < 2; k++) {
      const rock = new THREE.Mesh(ballGeo, rockMat);
      const a = rand(seed * 3 + k) * 6.28;
      rock.position.set(Math.cos(a) * r * 0.95, 0.1, Math.sin(a) * r * 0.8);
      rock.scale.setScalar(0.5 + rand(seed + k * 9) * 0.5);
      body.add(rock);
    }
    // 樹木與椰子樹
    const trees = Math.min(14, 3 + Math.round(c.items.length / 22));
    for (let t = 0; t < trees; t++) {
      const a = rand(seed + t * 3.1) * Math.PI * 2, rr = r * (0.3 + rand(seed + t) * 0.42);
      const tr = tree(rand(seed * 7 + t));
      tr.position.set(Math.cos(a) * rr, top, Math.sin(a) * rr * 0.8);
      body.add(tr);
    }
    for (let p = 0; p < 2; p++) {
      const a = rand(seed * 5 + p) * Math.PI * 2;
      const pm = palm(rand(seed + p * 13));
      pm.position.set(Math.cos(a) * r * 0.86, 0.6, Math.sin(a) * r * 0.72);
      body.add(pm);
    }

    // 選取光圈
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.4, r * 1.58, 64),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.5;
    root.add(ring);

    // 標籤與搜尋數字
    const labelW = Math.max(r * 2.3, 19);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture(App.emoji[c.name] || "🏝️", c.name, `${c.items.length} 支`), depthTest: false, transparent: true,
    }));
    label.scale.set(labelW, labelW * 300 / 512, 1);
    label.position.y = top + 3.5 + labelW * 0.3;
    label.renderOrder = 10;
    body.add(label);
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    badge.scale.setScalar(5);
    badge.position.set(labelW * 0.42, label.position.y + labelW * 0.2, 0);
    badge.renderOrder = 11; badge.visible = false;
    body.add(badge);

    root.userData.cat = c.name;
    scene.add(root);
    pickables.push(root);
    islands.push({
      c, root, body, ring, label, badge, landMat, r, wx, wz, seed, labelW,
      lift: 0, liftTo: 0, sink: 0, sinkTo: 0, op: 1, opTo: 1, badgeN: -1,
    });
  });

  // ---------- 雲 ----------
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa8b8, flatShading: true, transparent: true, opacity: 0.92 });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const puffs = 4 + Math.floor(rand(i * 3.3) * 4);
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(ballGeo, cloudMat);
      const s = 3 + rand(i * 11 + p) * 3.5;
      m.scale.set(s, s * 0.7, s);
      m.position.set((p - puffs / 2) * 3.4, rand(i + p * 7) * 1.5, rand(i * 2 + p) * 3 - 1.5);
      g.add(m);
    }
    const ang = (i / 14) * Math.PI * 2 + rand(i) * 0.4;
    const rad = 135 + rand(i * 5) * 80;
    g.userData = { ang, rad, h: 22 + rand(i * 9) * 14, speed: 0.012 + rand(i * 4) * 0.02 };
    scene.add(g);
    clouds.push(g);
  }

  // ---------- 鳥 ----------
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x23394a, side: THREE.DoubleSide });
  const birds = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const wingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.4), new THREE.Vector3(0, 0, 0.4), new THREE.Vector3(1.6, 0.2, 0)]);
    const l = new THREE.Mesh(wingGeo, birdMat), rr = new THREE.Mesh(wingGeo, birdMat);
    rr.scale.x = -1; g.add(l, rr);
    g.userData = { l, rr, ph: rand(i * 17) * 6.28, rad: 40 + i * 9, h: 22 + i * 2, sp: 0.12 + rand(i) * 0.05 };
    scene.add(g); birds.push(g);
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
      const el = 0.78;
      const t = new THREE.Vector3(isl.wx, 1.5, isl.wz);
      return { target: t, pos: t.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist)) };
    }
    az = Math.abs(az) < 0.9 ? az : 0;
    const dist = Math.max(165, 235 / aspect);
    const el = 0.92;
    const t = new THREE.Vector3(0, 0, 4);
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
  let running = true;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    waterMat.uniforms.uTime.value = REDUCED ? t * 0.3 : t;

    // 鏡頭飛行
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

    // 霧隨鏡頭距離調整
    const dist = camera.position.distanceTo(controls.target);
    scene.fog.near = dist * 1.15; scene.fog.far = dist * 2.8 + 120;
    waterMat.uniforms.uFogNear.value = scene.fog.near; waterMat.uniforms.uFogFar.value = scene.fog.far;

    // 島嶼浮動、懸停、淡出
    for (const isl of islands) {
      isl.liftTo = hovered === isl ? 1 : 0;
      isl.lift += (isl.liftTo - isl.lift) * 0.15;
      isl.sink += (isl.sinkTo - isl.sink) * 0.08;
      isl.op += (isl.opTo - isl.op) * 0.1;
      const bob = Math.sin(t * 0.9 + isl.seed) * (REDUCED ? 0.05 : 0.28);
      isl.body.position.y = bob + isl.lift * 1.2 - isl.sink * 1.0;
      isl.body.rotation.z = Math.sin(t * 0.7 + isl.seed * 2) * (REDUCED ? 0 : 0.012);
      isl.body.rotation.x = Math.cos(t * 0.6 + isl.seed) * (REDUCED ? 0 : 0.012);
      isl.label.material.opacity = isl.op;
      const ls = 1 + isl.lift * 0.08;
      isl.label.scale.set(isl.labelW * ls, isl.labelW * ls * 300 / 512, 1);
      const isActive = active === isl.c.name;
      isl.ring.material.opacity += ((isActive ? 0.55 + Math.sin(t * 3) * 0.25 : 0) - isl.ring.material.opacity) * 0.15;
    }
    for (const cl of clouds) {
      const u = cl.userData;
      u.ang += u.speed * dt * (REDUCED ? 0.2 : 1);
      cl.position.set(Math.cos(u.ang) * u.rad, u.h + Math.sin(t * 0.3 + u.rad) * 0.8, Math.sin(u.ang) * u.rad * 0.7);
      cl.rotation.y = -u.ang;
    }
    // 靠近鏡頭的雲淡出，避免擋住畫面
    const near = Math.max(45, dist * 0.55);
    for (const cl of clouds) cl.visible = cl.position.distanceTo(camera.position) > near;
    for (const b of birds) {
      const u = b.userData, a = u.ph + t * u.sp;
      b.position.set(Math.cos(a) * u.rad, u.h + Math.sin(t + u.ph) * 1.5, Math.sin(a) * u.rad * 0.6);
      b.rotation.y = -a;
      const flap = Math.sin(t * 9 + u.ph) * 0.6;
      u.l.rotation.z = flap; u.rr.rotation.z = -flap;
    }
    renderer.render(scene, camera);
  }

  const api = {
    focus, update, resize,
    stop() { running = false; canvas.style.display = "none"; },
    start() { if (!running) { running = true; clock.getDelta(); frame(); } canvas.style.display = ""; },
  };
  resize();
  frame();
  return api;
}

// ---------- 啟動與 2D/3D 切換 ----------
if (App && webglOK()) {
  let view = null;
  const want3D = localStorage.getItem("lispView") !== "2d";
  const enable = () => {
    try {
      if (!view) view = create3D(); else view.start();
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
  viewBtn.hidden = false;
  viewBtn.addEventListener("click", () => (view && document.querySelector("#map3d")?.style.display !== "none" ? disable() : enable()));
  if (want3D) enable(); else { viewBtn.textContent = "3D"; viewBtn.title = "切換到 3D 地圖"; }
}
