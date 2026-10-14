// 파장→색(CIE 1931 근사) 계산과, 드래그로 남길 빛을 고르는 스펙트럼 바 UI를 담당하는 모듈
// 셰이더(shaders.js SPECTRAL)와 같은 수식을 써서 바의 색과 입자의 색이 일치하도록 한다.

const lobe = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };

// CIE 1931 등색함수 다중 가우시안 근사 (Wyman·Sloan·Shirley 2013)
function xyz(l) {
  return [
    1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
    0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
    1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
  ];
}

// 파장(nm) → 선형 sRGB. 색상은 415–655nm로 고정(그 바깥은 실제 색상이 일정하고 근사식 꼬리에서 빨강이 초록으로 뒤집힘),
// 색역 밖 음수 성분은 잘라내고, 밝기만 실제 파장의 ȳ를 따른다.
export function spectralLinear(l) {
  const [X, Y, Z] = xyz(Math.min(655, Math.max(415, l)));
  const r = Math.max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z);
  const g = Math.max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z);
  const b = Math.max(0, 0.0557 * X - 0.2040 * Y + 1.0570 * Z);
  const k = (0.35 + 0.65 * Math.pow(Math.min(Math.max(xyz(l)[1], 0), 1), 0.3)) / Math.max(r, g, b, 1e-4);
  return [r * k, g * k, b * k];
}

const enc = (v) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2));
export const spectralCSS = (l) => { const [r, g, b] = spectralLinear(l); return `rgb(${enc(r)},${enc(g)},${enc(b)})`; };

export function colorName(l) {
  if (l < 450) return '보라';
  if (l < 485) return '파랑';
  if (l < 500) return '청록';
  if (l < 565) return '초록';
  if (l < 590) return '노랑';
  if (l < 625) return '주황';
  return '빨강';
}

/* ---------- 스펙트럼 바: 드래그·탭·화살표로 중심 파장, Esc나 '전체 보기'로 해제 ---------- */
export function initSpectrumBar({ bar, readout, onChange }) {
  const cv = bar.querySelector('canvas'), ctx = cv.getContext('2d'), win = bar.querySelector('.spec-win');
  const MIN = 380, MAX = 780, HW = 30;
  const state = { c: 580, on: false };

  function draw() {
    const dpr = Math.min(devicePixelRatio, 2);
    cv.width = Math.round(bar.clientWidth * dpr); cv.height = Math.round(bar.clientHeight * dpr);
    for (let x = 0; x < cv.width; x++) {
      ctx.fillStyle = spectralCSS(MIN + (x / cv.width) * (MAX - MIN));
      ctx.fillRect(x, 0, 1, cv.height);
    }
  }
  function render() {
    const lo = Math.max(MIN, state.c - HW), hi = Math.min(MAX, state.c + HW);
    win.style.left = `${((lo - MIN) / (MAX - MIN)) * 100}%`;
    win.style.width = `${((hi - lo) / (MAX - MIN)) * 100}%`;
    bar.classList.toggle('on', state.on);
    bar.setAttribute('aria-valuenow', Math.round(state.c));
    readout.innerHTML = state.on
      ? `<i class="sw" style="background:${spectralCSS(state.c)}"></i>${Math.round(state.c)} nm · ${colorName(state.c)}<button type="button">전체 보기</button>`
      : '모든 빛 · 380–780 nm';
    onChange(state.c, state.on ? HW : 400);
  }
  function pick(clientX) {
    const r = bar.getBoundingClientRect();
    state.c = MIN + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (MAX - MIN);
    state.on = true;
    render();
  }
  let dragging = false;
  bar.addEventListener('pointerdown', (e) => { dragging = true; bar.setPointerCapture(e.pointerId); pick(e.clientX); });
  bar.addEventListener('pointermove', (e) => { if (dragging) pick(e.clientX); });
  bar.addEventListener('pointerup', () => { dragging = false; });
  bar.addEventListener('pointercancel', () => { dragging = false; });
  bar.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 25 : 5;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { state.c = Math.min(MAX, state.c + step); state.on = true; }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { state.c = Math.max(MIN, state.c - step); state.on = true; }
    else if (e.key === 'Escape') state.on = false;
    else return;
    e.preventDefault();
    render();
  });
  readout.addEventListener('click', (e) => { if (e.target.closest('button')) { state.on = false; render(); } });
  addEventListener('resize', draw);
  draw(); render();
}
