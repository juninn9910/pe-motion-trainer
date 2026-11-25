# 동작 거울 (pe-motion-trainer) — 작업 지침

특수교육 체육용 웹앱. 웹캠 자세 인식(MediaPipe) + 조이콘(WebHID) 진동·스윙. 설계 전체는 README.md 4절.

## 사용자
- 박정인(쩡), 경산자인학교 특수교사. 비개발자 — 도메인 지식으로 지시하고 코드는 Claude가 쓴다.
- 한국어, 건조하고 단호하게. 모호하면 묻는다. 큰 설계 변경은 먼저 제안하고 합의 후 작성.
- 학생 화면은 **글자 최소화·고대비·큰 아이콘**. 교사 부담을 늘리는 입력 항목을 만들지 않는다.

## 스택
Vite 8 + React 19 + TypeScript 7 + Tailwind 4(`@tailwindcss/vite`) + `@mediapipe/tasks-vision` 1.2.x

## 좌표·부호 규약 (바꾸면 판정이 전부 틀어짐)
- 프레임 좌표는 **원본 카메라 영상 픽셀**(반전 전). 거울 반전은 video·canvas 의 CSS `scaleX(-1)` 로만 한다. 캔버스에 글자를 그리지 않는다(뒤집혀 보임).
- 해부학 방향 `(o 바깥, u 위, f 앞)`, 목표 각도 `raise`/`fwd` 정의는 `src/pose/kinematics.ts` 상단 주석.
- MediaPipe world z: 작을수록 카메라에 가까움 → `fwdSign = −1`. 캘리브레이션에서 코·어깨 z로 자동 확인.
- 좌우 부호는 매 프레임 어깨 x로 계산(`lateralSign2D/World`). 상수로 가정하지 않는다.

## 확정 결정
- 동작은 픽셀이 아닌 **관절 각도**로만 정의(`presets.ts`). 가이드는 캘리브레이션 비율 × 현재 어깨너비로 순기구학.
- 판정 = 뼈별 3D 사잇각 ≤ 허용 오차. 화면 평면 성분은 2D, 앞뒤 기울기는 world z (하이브리드).
- 진동 구역: 팔을 판정하는 동작은 왼팔→L, 오른팔→R 독립. 팔 미판정 동작(몸 수그리기)은 전체 일치 시 양쪽.
- MediaPipe WASM은 CDN이 아닌 `node_modules` 사본(`scripts/copy-mediapipe-wasm.mjs`, predev/prebuild). 모델은 `public/models` 우선, 없으면 구글 CDN.
- React StrictMode 미사용(카메라·HID·WASM 이중 초기화 방지).
- 진동 세기 상한 1.0(하드웨어 보호). 높이지 않는다.

## 검증
```bash
npm run typecheck      # tsc --noEmit
npm run build          # 타입검사 + 프로덕션 빌드
npm run dev            # http://localhost:5173/?sim → 카메라 없이 가상 학생으로 전체 흐름 확인
```
실제 카메라·조이콘 동작은 사용자가 확인한다. 카메라·조이콘 없이 검증한 범위를 넘어 "동작한다"고 말하지 않는다.

## 위치
OneDrive 밖(`C:\Users\박정인\dev\`)에 둔다 — node_modules 동기화 충돌 방지.
