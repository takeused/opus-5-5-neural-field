// 미니멀 3D 파티클 장면과 섹션 전환·포인터·패밀리·뉴럴 코어·effort·분광 필터·말 걸기 인터랙션을 묶는 진입점
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { particleVert, particleFrag, coreVert, coreFrag, edgeVert, edgeFrag, finishVert, finishFrag } from './shaders.js';
import { SHAPES, FAMILY } from './shapes.js';
import { initSpectrumBar } from './spectrum.js';

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const coarse = matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COUNT = reduced ? 30000 : coarse || innerWidth < 720 ? 45000 : 80000;
if (coarse) $('#hint').textContent = '밀기 · 탭 · 길게 누르기';

/* ---------- 렌더러 · 후처리 ---------- */
const canvas = $('#webgl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  // WebGL을 못 쓰면 장면 없이 글만 — 막을 걷고 등장 애니메이션을 끈 채 정적 배경으로
  root.classList.add('no-webgl');
  root.classList.remove('js');
  $('#veil').classList.add('off');
  throw err;
}
let DPR = Math.min(devicePixelRatio, coarse ? 1.5 : 2);
const DPR_MAX = DPR;
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x08070a, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 15);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.45, 0.2);
// 블룸은 절반 해상도로 계산 — 내장 GPU에서 비용을 1/4로
const bloomSetSize = bloom.setSize.bind(bloom);
bloom.setSize = (w, h) => bloomSetSize(Math.ceil(w / 2), Math.ceil(h / 2));
bloom.setSize(innerWidth * DPR, innerHeight * DPR);
composer.addPass(bloom);
const finish = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uCA: { value: 0.02 } }, vertexShader: finishVert, fragmentShader: finishFrag });
composer.addPass(finish);
composer.addPass(new OutputPass());

/* ---------- 배경 별: 깊이감만 주는 정도로 ---------- */
{
  const n = 1500, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 60 + Math.random() * 60, t = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
    p.set([s * Math.cos(t) * r, u * r, s * Math.sin(t) * r], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.22, color: 0x8a817b, transparent: true, opacity: 0.45 })));
}

/* ---------- 파티클 필드 ---------- */
const geo = new THREE.BufferGeometry();
const start = SHAPES.scatter(COUNT);
geo.setAttribute('position', new THREE.BufferAttribute(start, 3));
geo.setAttribute('aTarget', new THREE.BufferAttribute(start.slice(), 3));
const rnd = new Float32Array(COUNT * 4).map(Math.random); // x: 모핑 지연 · y: 크기 · z: 파장 · w: 위상
geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);

const U = {
  uTime: { value: 0 }, uProgress: { value: 1 }, uSize: { value: coarse ? 2.6 : 2.2 }, uPixelRatio: { value: DPR },
  uMouse: { value: new THREE.Vector3(999, 999, 0) }, uMouseR: { value: 2.4 }, uAttract: { value: 0 }, uMouseOn: { value: 0 }, uAlpha: { value: 1 },
  uShockPos: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) }, uShockTime: { value: [-99, -99, -99, -99] }, uShockStr: { value: [1, 1, 1, 1] },
  uColA: { value: new THREE.Color('#d97757') }, uColB: { value: new THREE.Color('#ffb38a') }, uColC: { value: new THREE.Color('#f0e6d8') },
  uModeFrom: { value: 0 }, uModeTo: { value: 0 }, uModeMix: { value: 1 }, uHeat: { value: 0.25 }, uChurn: { value: 0 }, uDisp: { value: 0 },
  uBand: { value: new THREE.Vector2(580, 400) },
  uFocus: { value: new THREE.Vector4(...FAMILY[1].c, 0) }, uFocusR: { value: FAMILY[1].r * 1.25 },
};
const field = new THREE.Points(geo, new THREE.ShaderMaterial({
  vertexShader: particleVert, fragmentShader: particleFrag, uniforms: U,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(field);

/* ---------- 뉴럴 코어: 03 effort 화면의 3D 모델 (입자 껍질 안의 신경망) ---------- */
// 켈빈 → 선형 sRGB (셰이더 blackbody()와 같은 Tanner Helland 근사)
function blackbody(K, out) {
  const t = K / 100, c = (v) => Math.min(1, Math.max(0, v));
  const r = t <= 66 ? 1 : c(1.29293618606 * Math.pow(t - 60, -0.1332047592));
  const g = t <= 66 ? c(0.39008157876 * Math.log(t) - 0.63184144378) : c(1.12989086089 * Math.pow(t - 60, -0.0755148492));
  const b = t >= 66 ? 1 : t <= 19 ? 0 : c(0.54320678911 * Math.log(t - 10) - 1.19625408914);
  return out.setRGB(r ** 2.2, g ** 2.2, b ** 2.2);
}
const core = new THREE.Group();
core.visible = false;
scene.add(core);
const heatA = new THREE.Color(), heatB = new THREE.Color(), heatC = new THREE.Color();
const coreUni = { uTime: { value: 0 }, uPulse: { value: 0 }, uGain: { value: 1 }, uColA: { value: heatA }, uColB: { value: heatB }, uColC: { value: heatC } };
core.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 32), new THREE.ShaderMaterial({ vertexShader: coreVert, fragmentShader: coreFrag, uniforms: coreUni })));

const CONCEPTS = ['추론', '코드', '수학', '언어', '비전', '도구 사용', '계획', '기억', '검증', '디자인', '셰이더', '파티클', '한국어', '에이전트', '안전', '호기심', '디버깅', '설명', '창의성', '정확성'];
const NODE_N = 150, nodes = [];
for (let i = 0, g = Math.PI * (3 - Math.sqrt(5)); i < NODE_N; i++) {
  const y = 1 - (i / (NODE_N - 1)) * 2, r = Math.sqrt(1 - y * y), rad = 2.5 + (Math.random() - 0.5) * 0.5;
  nodes.push(new THREE.Vector3(Math.cos(g * i) * r * rad, y * rad, Math.sin(g * i) * r * rad));
}
// 가장 가까운 이웃 3개와 연결 (중복 제거)
const ePos = [], eT = [], eSeed = [], linked = new Set();
nodes.forEach((p, i) => nodes.map((q, j) => [j, p.distanceToSquared(q)]).sort((a, b) => a[1] - b[1]).slice(1, 4).forEach(([j]) => {
  const key = i < j ? `${i}-${j}` : `${j}-${i}`;
  if (linked.has(key)) return;
  linked.add(key);
  const q = nodes[j], s = Math.random();
  ePos.push(p.x, p.y, p.z, q.x, q.y, q.z); eT.push(0, 1); eSeed.push(s, s);
}));
const edgeGeo = new THREE.BufferGeometry();
edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(ePos, 3));
edgeGeo.setAttribute('aT', new THREE.Float32BufferAttribute(eT, 1));
edgeGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(eSeed, 1));
const edgeUni = { uTime: { value: 0 }, uFire: { value: 0 }, uEffort: { value: 0.25 }, uColA: { value: heatA }, uColC: { value: heatC } };
core.add(new THREE.LineSegments(edgeGeo, new THREE.ShaderMaterial({ vertexShader: edgeVert, fragmentShader: edgeFrag, uniforms: edgeUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

const nodeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 10, 10), new THREE.MeshBasicMaterial({ toneMapped: false }), NODE_N);
const dummy = new THREE.Object3D(), nodeScale = new Float32Array(NODE_N).fill(1), nodeCol = new THREE.Color();
// effort 점등 순서: 구 전체에 고르게 켜지도록 노드마다 무작위 순위(Fisher–Yates)
const nodeRank = Float32Array.from({ length: NODE_N }, (_, i) => i / NODE_N);
for (let i = NODE_N - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [nodeRank[i], nodeRank[j]] = [nodeRank[j], nodeRank[i]]; }
nodes.forEach((p, i) => { dummy.position.copy(p); dummy.updateMatrix(); nodeMesh.setMatrixAt(i, dummy.matrix); nodeMesh.setColorAt(i, nodeCol.set(0xffffff)); });
core.add(nodeMesh);
let coreScale = 0;

/* ---------- 섹션: 형태 · 색(0 팔레트, 1 파장색, 2 흑체) · 화면 배치 ---------- */
const sections = [...document.querySelectorAll('main section')];
const halfH = (z) => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * z;
// 말 걸기 무대(빈 영역)의 화면 중심 → z=0 평면의 월드 y (섹션 상단이 뷰포트 상단에 맞을 때 기준)
function stageY() {
  const stage = $('#stage'), sec = $('#talk');
  const mid = (stage.getBoundingClientRect().top - sec.getBoundingClientRect().top + stage.offsetHeight / 2) / innerHeight;
  return (1 - Math.min(1, mid) * 2) * halfH(15);
}
function layout() {
  const narrow = innerWidth < 900;
  const hh = halfH(15), hw = hh * camera.aspect;
  const side = narrow ? [0, hh * 0.45] : [hw * 0.36, 0]; // 데스크톱은 글 단 오른쪽, 모바일은 화면 위쪽
  return {
    hero:  { shape: () => SHAPES.orb(COUNT), pos: side, scale: narrow ? 0.62 : 1, mode: 0, spin: true },
    about: { shape: () => SHAPES.galaxy(COUNT), pos: narrow ? side : [hw * 0.3, 0], scale: narrow ? 0.48 : 0.9, mode: 0, spin: false },
    family: { shape: () => SHAPES.clusters(COUNT), pos: narrow ? side : [hw * 0.34, 0], scale: narrow ? 0.5 : 0.9, mode: 0, spin: false },
    depth: { shape: () => SHAPES.orb(COUNT), pos: side, scale: narrow ? 0.62 : 1, mode: 2, spin: true },
    light: { shape: () => SHAPES.prism(COUNT, rnd), pos: narrow ? [-0.3, hh * 0.45] : [hw * 0.3, 0.4], scale: narrow ? 0.46 : 0.85, mode: 1, spin: false },
    talk:  { shape: () => SHAPES.text(COUNT, $('#say').value, narrow ? hw * 1.8 : Math.min(15, hw * 1.1)), pos: [narrow ? 0 : hw * 0.15, stageY()], scale: 1, mode: 0, spin: false },
  };
}
let STATES = layout();
let activeId = null, spinOn = true;
/* ---------- 그룹 배치: 섹션 좌표계 ---------- */
// 오브젝트는 섹션이 위로 떠나는 만큼 글과 똑같이 올라간다(보간 없이 고정). 들어오는 섹션의 오브젝트는 제자리에서 조립된다.
function anchorOf(id) {
  const top = document.getElementById(id).getBoundingClientRect().top;
  return THREE.MathUtils.clamp(-top / innerHeight, 0, 1.2) * 2 * halfH(15);
}
function placeGroup(id) {
  const st = STATES[id];
  field.position.set(st.pos[0], st.pos[1] + anchorOf(id), 0);
  field.scale.setScalar(st.scale);
  field.updateMatrix();
}

/* ---------- 모핑: 현재 보간 위치를 굳힌 뒤 새 목표로 ---------- */
// 입자가 빽빽한 형태는 블룸 과노출을 막기 위해 어둡게, 깊이 섹션은 안쪽 뉴럴 코어가 주인공이라 껍질을 옅게
const ALPHA = { talk: 0.62, light: 0.75, depth: 0.5 };
let morphT = 1, morphDur = 2.4, alphaTarget = 1;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// T(선택): 옛 그룹 좌표 → 새 그룹 좌표 변환. 그룹을 순간 이동시켜도 입자의 월드 위치가 그대로 이어지게 한다.
function morphTo(arr, dur = 2.4, T = null) {
  const pos = geo.attributes.position.array, tgt = geo.attributes.aTarget.array, m = T && T.elements;
  for (let i = 0; i < COUNT; i++) {
    const e = ease(Math.min(1, Math.max(0, morphT * 1.5 - rnd[i * 4] * 0.5))), k = i * 3;
    let x = pos[k] + (tgt[k] - pos[k]) * e, y = pos[k + 1] + (tgt[k + 1] - pos[k + 1]) * e, z = pos[k + 2] + (tgt[k + 2] - pos[k + 2]) * e;
    if (m) {
      const nx = m[0] * x + m[4] * y + m[8] * z + m[12], ny = m[1] * x + m[5] * y + m[9] * z + m[13];
      z = m[2] * x + m[6] * y + m[10] * z + m[14]; x = nx; y = ny;
    }
    pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
  }
  tgt.set(arr);
  geo.attributes.position.needsUpdate = true;
  geo.attributes.aTarget.needsUpdate = true;
  morphT = 0; morphDur = dur;
}
function setMode(m) {
  if (m === U.uModeTo.value) return;
  U.uModeFrom.value = U.uModeMix.value > 0.5 ? U.uModeTo.value : U.uModeFrom.value;
  U.uModeTo.value = m; U.uModeMix.value = 0;
}

/* ---------- 충격파 ---------- */
let shockIdx = 0;
const clock = new THREE.Clock();
function shock(localPos, str = 1) {
  U.uShockPos.value[shockIdx].copy(localPos);
  U.uShockTime.value[shockIdx] = U.uTime.value;
  U.uShockStr.value[shockIdx] = str;
  shockIdx = (shockIdx + 1) % 4;
  finish.uniforms.uCA.value = Math.min(0.4, finish.uniforms.uCA.value + 0.1 * str);
}

/* ---------- 포인터: 이동=밀어냄 · 클릭=충격파 · 길게=중력 · 드래그=회전 ---------- */
const ndc = new THREE.Vector2(), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const mouseWorld = new THREE.Vector3(), mouseLocal = new THREE.Vector3();
let mouseSeen = false;
function updateMouse() {
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(plane, mouseWorld)) mouseLocal.copy(field.worldToLocal(mouseWorld.clone()));
}
addEventListener('pointermove', (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  mouseSeen = true;
}, { passive: true });

let down = false, dragging = false, holding = false, holdTimer = 0, downX = 0, downY = 0, lastX = 0, lastY = 0;
let dragYaw = 0, dragPitch = 0, velYaw = 0, velPitch = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  down = true; dragging = holding = false;
  downX = lastX = e.clientX; downY = lastY = e.clientY;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); mouseSeen = true;
  $('#hint').classList.add('off');
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { if (down && !dragging) holding = true; }, 280);
});
addEventListener('pointermove', (e) => {
  if (!down) return;
  if (!dragging && !holding && Math.hypot(e.clientX - downX, e.clientY - downY) > 7) dragging = true;
  if (dragging) { velYaw = (e.clientX - lastX) * 0.003; velPitch = (e.clientY - lastY) * 0.002; } // 화면 폭만큼 밀면 반 바퀴쯤
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('pointerup', () => {
  if (!down) return;
  if (!dragging) { updateMouse(); shock(mouseLocal, holding ? 1.4 : 1); }
  resetPointer();
});
function resetPointer() { down = dragging = holding = false; clearTimeout(holdTimer); }
addEventListener('pointercancel', resetPointer);
addEventListener('blur', resetPointer);

/* ---------- 02 패밀리: 줄에 올리거나 누르면 그 모델의 성단이 빛난다 ---------- */
const famBtns = [...document.querySelectorAll('.fam button')];
let famFocus = 1;
function setFamily(i, pulse = true) {
  if (i === famFocus) return;
  famFocus = i;
  famBtns.forEach((b, j) => b.setAttribute('aria-pressed', j === i));
  if (pulse && activeId === 'family') shock(new THREE.Vector3(...FAMILY[i].c), 0.35);
}
famBtns.forEach((b, i) => {
  b.addEventListener('pointerenter', () => setFamily(i));
  b.addEventListener('focus', () => setFamily(i));
  b.addEventListener('click', () => setFamily(i));
});
// 마우스가 목록을 떠나면 '지금 여기'(Opus)로 돌아온다 — 터치는 탭 뒤에 leave가 바로 오므로 제외
$('.fam').addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setFamily(1, false); });

/* ---------- 03 effort: 뉴런이 켜지고 신호가 빨라지며, 입자 껍질이 달아오른다(흑체 온도) ---------- */
const EFFORT = [
  ['가볍게. 짧고 빠르게 답합니다.', 0],
  ['기본값. 비용과 품질의 균형점.', 0.25],
  ['지능이 중요한 일이라면 여기부터.', 0.5],
  ['길고 복잡한 코딩·에이전트 작업에.', 0.75],
  ['정확성이 비용보다 중요할 때.', 1],
];
const dial = $('.dial'), dialBtns = [...dial.querySelectorAll('button')];
let effort = 0.25;
function setEffort(i, pulse = true) {
  effort = EFFORT[i][1];
  dialBtns.forEach((b, j) => b.setAttribute('aria-checked', j === i));
  dial.style.setProperty('--i', i);
  $('#dial-note').textContent = EFFORT[i][0];
  if (!pulse) return;
  shock(new THREE.Vector3(), 0.4 + effort * 0.6);
  edgeUni.uFire.value = Math.min(2, edgeUni.uFire.value + 0.4 + effort);
  coreUni.uPulse.value = Math.min(1.5, coreUni.uPulse.value + 0.5);
}
dialBtns.forEach((b, i) => b.addEventListener('click', () => setEffort(i)));
dial.addEventListener('keydown', (e) => {
  const cur = dialBtns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
  const next = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(4, cur + 1) : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(0, cur - 1) : -1;
  if (next < 0) return;
  e.preventDefault(); setEffort(next); dialBtns[next].focus();
});
setEffort(1, false);

/* ---------- 뉴럴 코어 갱신: 03 섹션에 묶여 스크롤과 함께, 활성일 때만 나타난다 ---------- */
const tip = $('#tip'), tipPos = new THREE.Vector3();
let hoverNode = -1;
function setTip(id) {
  if (id === hoverNode) return;
  hoverNode = id;
  if (id < 0) { tip.classList.remove('on'); return; }
  tip.textContent = `◉ ${CONCEPTS[id % CONCEPTS.length]} · neuron ${String(id).padStart(3, '0')}`;
  tip.classList.add('on');
  edgeUni.uFire.value = Math.min(2, edgeUni.uFire.value + 0.5);
}
function updateCore(t) {
  coreScale += ((activeId === 'depth' ? STATES.depth.scale : 0) - coreScale) * 0.08;
  core.visible = coreScale > 0.01;
  if (!core.visible) { setTip(-1); return; }
  const st = STATES.depth;
  core.position.set(st.pos[0], st.pos[1] + anchorOf('depth'), 0);
  core.scale.setScalar(coreScale);
  core.rotation.set(dragPitch * 0.5, (reduced ? 0 : t * 0.15) + dragYaw * 0.7, 0);
  core.updateMatrixWorld();

  // 온도: effort를 부드럽게 따라가는 uHeat로 코어 색을 정한다 (입자 껍질과 같은 온도)
  const e = U.uHeat.value, K = 1500 + e * 9000;
  blackbody(K * 0.6, heatA); blackbody(K, heatB); blackbody(K * 1.45, heatC);
  coreUni.uTime.value = edgeUni.uTime.value = t;
  edgeUni.uEffort.value = e;
  coreUni.uPulse.value = e * 0.15 + (coreUni.uPulse.value - e * 0.15) * 0.95;
  coreUni.uGain.value = 1 - e * 0.45;
  edgeUni.uFire.value *= 0.965;

  // 뉴런 호버: 마우스가 움직였고 누르고 있지 않을 때만
  if (mouseSeen && !down && !coarse) {
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(nodeMesh, false)[0];
    setTip(hit ? hit.instanceId : -1);
  }
  for (let i = 0; i < NODE_N; i++) {
    const lit = nodeRank[i] < 0.3 + e * 0.7;
    const want = i === hoverNode ? 3.2 : lit ? 1 + Math.max(0, Math.sin(t * (2 + e * 4) + i)) * (0.4 + e * 0.5) : 0.55;
    nodeScale[i] += (want - nodeScale[i]) * 0.2;
    dummy.position.copy(nodes[i]); dummy.scale.setScalar(nodeScale[i]); dummy.updateMatrix();
    nodeMesh.setMatrixAt(i, dummy.matrix);
    nodeMesh.setColorAt(i, nodeCol.copy(i % 3 ? heatB : heatC).multiplyScalar(i === hoverNode ? 3 : lit ? 1.25 : 0.18));
  }
  nodeMesh.instanceMatrix.needsUpdate = true;
  nodeMesh.instanceColor.needsUpdate = true;
  if (hoverNode >= 0) {
    tipPos.copy(nodes[hoverNode]).applyMatrix4(core.matrixWorld).project(camera);
    tip.style.left = `${(tipPos.x * 0.5 + 0.5) * innerWidth}px`;
    tip.style.top = `${(-tipPos.y * 0.5 + 0.5) * innerHeight}px`;
  }
}

/* ---------- 04 분광 필터: 빛 섹션에서만 적용 ---------- */
const band = new THREE.Vector2(580, 400), FULL_BAND = new THREE.Vector2(580, 400);
initSpectrumBar({ bar: $('#spec'), readout: $('#spec-read'), onChange: (c, hw) => band.set(c, hw) });

/* ---------- 05 말 걸기 ---------- */
let typeTimer = 0;
$('#say').addEventListener('input', () => {
  clearTimeout(typeTimer);
  typeTimer = setTimeout(() => { if (activeId === 'talk') morphTo(STATES.talk.shape(), 1.6); }, 300);
});
$('#say').addEventListener('keydown', (e) => { if (e.key === 'Enter') shock(new THREE.Vector3(), 1.2); });

/* ---------- 스크롤: 화면 중앙에 걸친 섹션으로 전환 ---------- */
function updateSection() {
  const mid = innerHeight / 2;
  const sec = sections.find((s) => { const r = s.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
  const id = sec ? sec.id : activeId || 'hero';
  if (id === activeId) return;
  activeId = id;
  const st = STATES[id];
  // 옛 그룹 행렬 → 새 그룹 행렬로 입자를 옮겨 담은 뒤 그룹을 새 자리로 순간 이동 (화면상 위치는 연속)
  field.updateMatrix();
  const oldM = field.matrix.clone();
  placeGroup(id);
  morphTo(st.shape(), 2.4, field.matrix.clone().invert().multiply(oldM));
  setMode(st.mode);
  spinOn = st.spin;
  alphaTarget = ALPHA[id] ?? 1;
}
let resizeTimer = 0;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  clearTimeout(resizeTimer);
  // 배치가 바뀌어도 입자가 튀지 않게 같은 방식으로 옮겨 담는다
  resizeTimer = setTimeout(() => {
    STATES = layout();
    if (!activeId) return;
    field.updateMatrix();
    const oldM = field.matrix.clone();
    placeGroup(activeId);
    morphTo(STATES[activeId].shape(), 1.2, field.matrix.clone().invert().multiply(oldM));
  }, 300);
});

// 섹션이 보이면 글을 순서대로 등장시킨다
const io = new IntersectionObserver((es) => es.forEach((en) => en.isIntersecting && en.target.classList.add('in')), { threshold: 0.25 });
sections.forEach((s) => io.observe(s));

/* ---------- 적응형 품질: 프레임이 계속 낮으면 해상도를 단계적으로 ---------- */
let slow = 0, fast = 0;
function adapt(fps) {
  if (document.hidden || clock.elapsedTime < 4 || morphT < 1) return;
  slow = fps < 40 ? slow + 1 : 0;
  fast = fps > 56 ? fast + 1 : 0;
  let next = DPR;
  if (slow >= 4 && DPR > 0.75) next = DPR - 0.25;
  else if (fast >= 6 && DPR < DPR_MAX) next = Math.min(DPR_MAX, DPR + 0.25);
  if (next === DPR) return;
  DPR = next; slow = fast = 0;
  renderer.setPixelRatio(DPR); composer.setPixelRatio(DPR); composer.setSize(innerWidth, innerHeight);
  U.uPixelRatio.value = DPR;
}

/* ---------- 루프 ---------- */
const TAU = Math.PI * 2;
let spin = 0, frames = 0, acc = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  U.uTime.value = t;
  morphT = Math.min(1, morphT + dt / morphDur);
  U.uProgress.value = morphT;
  U.uModeMix.value = Math.min(1, U.uModeMix.value + dt / 1.4);
  U.uAlpha.value += (alphaTarget - U.uAlpha.value) * 0.05;

  // 섹션별 효과: effort 요동은 깊이 섹션에서만, 분광 필터·분산은 빛 섹션에서만
  const inDepth = activeId === 'depth', inLight = activeId === 'light';
  U.uHeat.value += (effort - U.uHeat.value) * 0.05;
  U.uChurn.value += ((inDepth ? (0.06 + effort * 0.85) * (reduced ? 0.4 : 1) : 0) - U.uChurn.value) * 0.04;
  U.uDisp.value += ((inLight ? 1 : 0) - U.uDisp.value) * 0.05;
  U.uBand.value.lerp(inLight ? band : FULL_BAND, 0.15);
  finish.uniforms.uCA.value += (0.02 - finish.uniforms.uCA.value) * 0.06;
  // 패밀리: 고른 모델의 성단으로 하이라이트가 미끄러져 간다
  const f = FAMILY[famFocus], fv = U.uFocus.value;
  fv.x += (f.c[0] - fv.x) * 0.12; fv.y += (f.c[1] - fv.y) * 0.12; fv.z += (f.c[2] - fv.z) * 0.12;
  fv.w += ((activeId === 'family' ? 0.8 : 0) - fv.w) * 0.08;
  U.uFocusR.value += (f.r * 1.25 - U.uFocusR.value) * 0.12;

  // 그룹 배치: 보간 없이 섹션 좌표계에 고정 (전환은 updateSection에서 입자를 옮겨 담아 처리)
  if (activeId) placeGroup(activeId);

  // 회전: 드래그 관성 + 구는 천천히 자전, 나머지는 정면으로 복귀
  if (!dragging) { velYaw *= 0.94; velPitch *= 0.94; dragYaw *= 0.985; dragPitch *= 0.97; }
  dragYaw += velYaw; dragPitch = THREE.MathUtils.clamp(dragPitch + velPitch, -0.8, 0.8);
  if (spinOn && !reduced) spin += dt * 0.08;
  else spin += (Math.round(spin / TAU) * TAU - spin) * 0.04;
  field.rotation.set(dragPitch * 0.5, spin + dragYaw * 0.7, 0);

  // 마우스
  if (mouseSeen) updateMouse();
  U.uMouse.value.copy(mouseLocal);
  U.uMouseOn.value += ((mouseSeen ? 1 : 0) - U.uMouseOn.value) * 0.1;
  U.uAttract.value += ((holding ? 1 : 0) - U.uAttract.value) * 0.08;

  // 카메라: 아주 약한 패럴랙스 (동작 줄이기 설정이면 고정)
  if (!reduced) {
    camera.position.x += (ndc.x * 0.6 - camera.position.x) * 0.03;
    camera.position.y += (ndc.y * 0.4 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
  }

  updateSection();
  updateCore(t);
  composer.render();

  frames++; acc += dt;
  if (acc > 0.5) { adapt(frames / acc); frames = 0; acc = 0; }
  requestAnimationFrame(tick);
}

window.__opus = { U, field, renderer, composer, finish, core, edgeUni };

/* ---------- 푸터: 이 페이지를 만드는 데 든 것 한 줄 ---------- */
fetch('stats.json', { cache: 'no-store' })
  .then((r) => r.json())
  .then((s) => { $('#made').textContent = `이 페이지는 Claude Opus 5.5가 직접 만들었습니다 · 작업 ${s.minutes}분 · 출력 ${s.output} 토큰 · API 환산 약 $${s.cost}`; })
  .catch(() => { /* 집계 전이면 기본 문구 유지 */ });

/* ---------- 시작: 폰트를 기다린 뒤 막을 걷는다 ---------- */
(async () => {
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]); } catch { /* 시스템 폰트로 진행 */ }
  renderer.compile(scene, camera);
  tick();
  root.classList.add('ready');
  requestAnimationFrame(() => $('#veil').classList.add('off'));
})();
