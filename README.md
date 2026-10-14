# Claude Opus 5.5 — Neural Field

이 페이지를 직접 만든 모델, Claude Opus 5.5를 소개하는 인터랙티브 3D 파티클 사이트입니다.
Claude Code 세션 안에서 Opus 5.5가 기획·구현·검증까지 진행했습니다.

## 실행

```bash
npm install
npm start
```

`http://localhost:20000` — 20000번이 사용 중이면 20001, 20002 … 순서로 빈 포트를 찾습니다.

## 구성

| 화면 | 내용 | 조작 |
|---|---|---|
| 첫 화면 | 회전하는 입자 구 | — |
| 01 한눈에 보기 | 1M · 128K · $4/$20 · 2026.06 | — |
| 02 Claude 5 패밀리 | 네 모델과 입자 성단 | 줄에 올리거나 탭 → 해당 성단 강조 |
| 03 얼마나 깊이 생각할까 | 입자 껍질 안의 뉴럴 코어 | effort 다이얼 → 뉴런 점등·신호 속도·흑체 온도 |
| 04 빛으로 나누기 | 백색광 → 프리즘 → 무지개 | 스펙트럼 바 드래그 → 분광 필터 |
| 05 말을 걸어 보세요 | 입자가 글자로 재조립 | 입력 |

어디서나: 마우스 이동 = 밀어냄 · 클릭/탭 = 충격파 · 길게 누르기 = 중력 · 드래그 = 회전

## 기술

- three.js r160, 빌드 단계 없음 (ES 모듈 + importmap, three는 `node_modules`에서 서빙)
- 파티클 8만 개(모바일 4.5만): 셰이더에서 모핑·마우스·충격파·분산·분광 필터 처리
- 색: CIE 1931 등색함수 근사(Wyman 2013)로 파장→sRGB, Tanner Helland 근사로 흑체 온도→색
- 섹션 전환 시 입자를 새 좌표계로 옮겨 담아(bake) 화면상 위치가 끊기지 않음
- 적응형 해상도, `prefers-reduced-motion` 대응, WebGL·JS 실패 시에도 글은 보임

## 파일

- `server.js` — 의존성 없는 정적 서버
- `public/js/main.js` — 장면·섹션·인터랙션
- `public/js/shaders.js` — GLSL (파티클·뉴럴 코어·렌즈 마무리)
- `public/js/shapes.js` — 형태 생성 (구·은하·성단·프리즘·글자)
- `public/js/spectrum.js` — 파장→색, 스펙트럼 바
- `checklist.md`, `context-notes.md` — 작업 체크리스트와 결정 기록
