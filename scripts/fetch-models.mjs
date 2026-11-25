// (선택) 자세 인식 모델 파일을 public/models 에 내려받는다.
// 학교망에서 storage.googleapis.com 이 막혀 있을 때 사용한다.
// 파일이 있으면 앱이 로컬 파일을 먼저 쓰고, 없으면 구글 CDN에서 받는다.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'models');
mkdirSync(dir, { recursive: true });

const MODELS = {
  'pose_landmarker_lite.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  'pose_landmarker_full.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};

for (const [name, url] of Object.entries(MODELS)) {
  const to = join(dir, name);
  if (existsSync(to)) {
    console.log(`이미 있음: ${name}`);
    continue;
  }
  process.stdout.write(`내려받는 중: ${name} ... `);
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`실패 (${res.status})`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(to, buf);
  console.log(`${(buf.length / 1024 / 1024).toFixed(1)} MB`);
}
