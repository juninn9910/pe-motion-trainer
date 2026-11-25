// MediaPipe WASM 런타임을 node_modules → public/mediapipe/wasm 으로 복사한다.
// 설치된 @mediapipe/tasks-vision 버전과 WASM 버전이 항상 일치하도록 CDN 대신 로컬 사본을 쓴다.
// (npm run dev / npm run build 직전에 자동 실행)
import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dst = join(root, 'public', 'mediapipe', 'wasm');
const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

if (!existsSync(src)) {
  console.error('[copy-mediapipe-wasm] @mediapipe/tasks-vision 이 설치되어 있지 않습니다. 먼저 npm install 을 실행하세요.');
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
for (const f of files) {
  const from = join(src, f);
  const to = join(dst, f);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  cpSync(from, to);
  console.log(`[copy-mediapipe-wasm] ${f} 복사`);
}
