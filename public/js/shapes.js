// 파티클이 모핑할 목표 형태(구·은하·프리즘·글자)를 원점 기준으로 생성하는 모듈 — 배치는 그룹 위치·크기로 한다
const TAU = Math.PI * 2;
const R = Math.random;
function gauss() {
  let u = 0, v = 0;
  while (!u) u = R();
  while (!v) v = R();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}
function onSphere(out, i, r) {
  const u = R() * 2 - 1, t = R() * TAU, s = Math.sqrt(1 - u * u);
  out[i] = s * Math.cos(t) * r; out[i + 1] = u * r; out[i + 2] = s * Math.sin(t) * r;
}
function tilt(out, i, ax, az) {
  let x = out[i], y = out[i + 1], z = out[i + 2], c = Math.cos(ax), s = Math.sin(ax), t;
  t = y * c - z * s; z = y * s + z * c; y = t;
  c = Math.cos(az); s = Math.sin(az); t = x * c - y * s; y = x * s + y * c; x = t;
  out[i] = x; out[i + 1] = y; out[i + 2] = z;
}

// Claude 5 패밀리 성단 배치: 목록 순서(Fable → Opus → Sonnet → Haiku)대로 위에서 아래로 내려가는 대각선, 크기는 체급 순
export const FAMILY = [
  { c: [-2.6, 3.0, 0], r: 1.7 },
  { c: [1.3, 1.1, 0], r: 1.35 },
  { c: [-1.3, -1.5, 0], r: 1.05 },
  { c: [2.3, -3.2, 0], r: 0.65 },
];

export const SHAPES = {
  // 시작 상태: 멀리 흩어진 입자
  scatter(n) {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) onSphere(a, i * 3, 18 + R() * 40);
    return a;
  },

  // 3D 구: 얇은 껍질 72% + 속을 채운 입자 28%
  orb(n, r = 4.2) {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) onSphere(a, i * 3, R() < 0.72 ? r * (1 + gauss() * 0.012) : r * 0.92 * Math.cbrt(R()));
    return a;
  },

  // 네 팔 나선 은하 (살짝 기울여 입체감)
  galaxy(n) {
    const a = new Float32Array(n * 3), arms = 4;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      if (R() < 0.06) {
        onSphere(a, k, Math.abs(gauss()) * 1.3);
        a[k + 1] *= 0.6;
      } else {
        const r = Math.pow(R(), 1.5) * 10.5 + 0.5;
        const ang = ((i % arms) / arms) * TAU + r * 0.52 + gauss() * 0.22 * (1.3 - r / 12);
        a[k] = Math.cos(ang) * r + gauss() * 0.28;
        a[k + 1] = gauss() * 0.22 * (1.2 - r / 12);
        a[k + 2] = Math.sin(ang) * r + gauss() * 0.28;
      }
      tilt(a, k, 0.55, 0.12);
    }
    return a;
  },

  // 네 성단 + 이웃 성단을 잇는 가는 입자 다리. 입자 수는 성단 부피(r²)에 비례
  clusters(n) {
    const a = new Float32Array(n * 3);
    const w = FAMILY.map((f) => f.r * f.r), sum = w.reduce((s, v) => s + v, 0);
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      let p = R() * sum, c = 0;
      while (p > w[c] && c < 3) p -= w[c++];
      const { c: [cx, cy, cz], r } = FAMILY[c];
      if (c < 3 && R() < 0.07) {
        const [dx, dy, dz] = FAMILY[c + 1].c, u = R();
        a[k] = cx + (dx - cx) * u + gauss() * 0.05;
        a[k + 1] = cy + (dy - cy) * u + gauss() * 0.05;
        a[k + 2] = cz + (dz - cz) * u + Math.sin(u * Math.PI) * 0.8;
      } else {
        onSphere(a, k, R() < 0.65 ? r * (1 + gauss() * 0.03) : r * Math.cbrt(R()));
        a[k] += cx; a[k + 1] += cy; a[k + 2] += cz;
      }
    }
    return a;
  },

  // 백색광 → 삼각 프리즘 → 무지개 부채꼴. rnd(aRnd)의 z 성분이 입자의 파장이므로 같은 배열로 굴절각을 정한다.
  prism(n, rnd) {
    const a = new Float32Array(n * 3), S = 2.6, depth = 1.3;
    const V = [0, 1, 2].map((i) => { const t = Math.PI / 2 + (i * TAU) / 3; return [Math.cos(t) * S, Math.sin(t) * S]; });
    const lerp2 = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    const entry = lerp2(V[0], V[1], 0.55);
    const beamStart = [entry[0] - 9, entry[1] + 3.2];
    // 코시 분산식 n(λ) = 1.5 + 4200/λ²
    const N_RED = 1.5 + 4200 / (780 * 780), N_VIO = 1.5 + 4200 / (380 * 380);
    for (let i = 0; i < n; i++) {
      const k = i * 3, wl = 380 + rnd[i * 4 + 2] * 400;
      const disp = (1.5 + 4200 / (wl * wl) - N_RED) / (N_VIO - N_RED); // 0 = 빨강(덜 꺾임) … 1 = 보라(많이 꺾임)
      const exit = lerp2(V[0], V[2], 0.36 + disp * 0.3);
      const p = R();
      let x, y, z = 0;
      if (p < 0.2) {
        // 프리즘 모서리: 앞·뒤 삼각형 6개 변 + 옆 모서리 3개
        const e = (R() * 9) | 0, u = R();
        if (e < 6) { [x, y] = lerp2(V[e % 3], V[(e + 1) % 3], u); z = e < 3 ? -depth : depth; }
        else { [x, y] = V[e - 6]; z = (u * 2 - 1) * depth; }
        x += gauss() * 0.02; y += gauss() * 0.02;
      } else if (p < 0.33) {
        // 들어오는 백색광: 모든 파장이 한 줄에 겹쳐 가산 혼합으로 하얗게 보인다
        [x, y] = lerp2(beamStart, entry, R());
        x += gauss() * 0.04; y += gauss() * 0.04; z = gauss() * 0.04;
      } else if (p < 0.41) {
        // 프리즘 내부: 입사점에서 파장별 출사점으로 벌어진다
        [x, y] = lerp2(entry, exit, R());
        z = gauss() * 0.04;
      } else {
        // 출사 부채꼴: 보라일수록 아래로 더 크게 꺾인다
        const ang = -0.12 - disp * 0.6 + gauss() * 0.012, L = Math.pow(R(), 0.8) * 9;
        x = exit[0] + Math.cos(ang) * L; y = exit[1] + Math.sin(ang) * L;
        z = gauss() * 0.05 * (1 + L * 0.06);
      }
      a[k] = x; a[k + 1] = y; a[k + 2] = z;
    }
    return a;
  },

  // 글자: 캔버스에 그린 뒤 픽셀을 샘플링. 86%는 글자, 나머지는 주변 먼지
  text(n, str, maxW = 15) {
    const a = new Float32Array(n * 3);
    const text = (str || '').trim() || 'Opus 5.5';
    const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
    const font = (s) => `700 ${s}px "Noto Sans KR", "Space Grotesk", "Malgun Gothic", sans-serif`;
    let fs = 180;
    ctx.font = font(fs);
    let w = ctx.measureText(text).width;
    if (w > 2000) { fs = Math.floor((fs * 2000) / w); ctx.font = font(fs); w = ctx.measureText(text).width; }
    c.width = Math.ceil(w + 40); c.height = Math.ceil(fs * 1.35);
    ctx.font = font(fs); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, c.width / 2, c.height / 2);
    const img = ctx.getImageData(0, 0, c.width, c.height).data, pts = [];
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (img[(y * c.width + x) * 4 + 3] > 128) pts.push(x, y);
    const scale = Math.min(maxW / c.width, 4.6 / c.height), count = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      if (count && i < n * 0.86) {
        const j = ((R() * count) | 0) * 2;
        a[k] = (pts[j] - c.width / 2 + R() * 2) * scale;
        a[k + 1] = -(pts[j + 1] - c.height / 2 + R() * 2) * scale;
        a[k + 2] = gauss() * 0.12;
      } else {
        // 주변 먼지: 글자 뒤쪽 반구에만 둬서 카메라(z=15) 가까이 흐릿한 큰 점이 생기지 않게 한다
        onSphere(a, k, 6 + R() * 4);
        a[k + 2] = -Math.abs(a[k + 2]) - 1;
      }
    }
    return a;
  },
};
