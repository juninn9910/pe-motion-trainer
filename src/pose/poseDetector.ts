// MediaPipe PoseLandmarker 래퍼. 모든 추론은 브라우저 안(온디바이스)에서 실행되며
// 카메라 영상은 어디에도 전송되지 않는다. 외부에서 받는 것은 모델 파일뿐이다.

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { ModelVariant } from '../types';
import type { RawPose } from './poseFrame';

const CDN_MODEL: Record<ModelVariant, string> = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};

function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).href;
}

/** public/models 에 모델 파일이 있으면 그걸 쓰고(학교망 차단 대비), 없으면 구글 CDN */
async function resolveModelPath(variant: ModelVariant): Promise<string> {
  const local = assetUrl(`models/pose_landmarker_${variant}.task`);
  try {
    const res = await fetch(local, { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    // 개발 서버는 없는 경로에 index.html(200)을 돌려주므로 HTML이면 '없음'으로 본다
    if (res.ok && !type.includes('text/html')) return local;
  } catch {
    /* 로컬 파일 없음 */
  }
  return CDN_MODEL[variant];
}

export class PoseDetector {
  private lastTs = 0;

  private constructor(
    private landmarker: PoseLandmarker,
    readonly delegate: 'GPU' | 'CPU',
  ) {}

  static async create(variant: ModelVariant): Promise<PoseDetector> {
    const fileset = await FilesetResolver.forVisionTasks(assetUrl('mediapipe/wasm'));
    const modelAssetPath = await resolveModelPath(variant);
    const make = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
    try {
      return new PoseDetector(await make('GPU'), 'GPU');
    } catch (err) {
      console.warn('[PoseDetector] GPU 초기화 실패 → CPU로 전환', err);
      return new PoseDetector(await make('CPU'), 'CPU');
    }
  }

  detect(video: HTMLVideoElement, now: number): RawPose | null {
    const ts = Math.max(now, this.lastTs + 1); // 타임스탬프는 반드시 증가해야 함
    this.lastTs = ts;
    const res = this.landmarker.detectForVideo(video, ts);
    const lms = res.landmarks?.[0];
    const wl = res.worldLandmarks?.[0];
    if (!lms || !wl || lms.length < 33 || wl.length < 33) return null;
    // 일부 버전은 visibility를 0으로만 채운다 → 그런 경우 가시도 판정을 끈다
    const visSupported = lms.some((l) => (l.visibility ?? 0) > 0);
    return {
      img: lms.map((l) => ({ x: l.x, y: l.y })),
      world: wl.map((l) => ({ x: l.x, y: l.y, z: l.z })),
      vis: lms.map((l) => (visSupported ? (l.visibility ?? 1) : 1)),
    };
  }

  close() {
    try {
      this.landmarker.close();
    } catch {
      /* 이미 닫힘 */
    }
  }
}
