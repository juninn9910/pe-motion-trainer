// 2초 정자세 캘리브레이션 → 학생 개인의 신체 비율(어깨너비 = 1 기준).
//
// 뼈 길이(픽셀 단위 3D 길이) = √( 2D 영상 길이² + (world 깊이차 × 픽셀/미터)² )
//   - 2D 길이는 실제 영상에서 잰 그 학생의 길이 (개인 맞춤의 핵심)
//   - 깊이 보정은 팔을 살짝 굽히고 있거나 휠체어 팔걸이를 잡고 있어도 길이가 짧게 잡히지 않게 한다
// 프레임마다 잰 값의 '중앙값'을 써서 순간적인 흔들림·인식 오류를 걸러낸다.

import type { BodyMode } from '../types';
import type { Sign } from './kinematics';
import { LM, type JointRef } from './landmarks';
import { dist2, dist3, isVisible, jointImg, jointWorld, type PoseFrame } from './poseFrame';

export interface BodyRatios {
  upperL: number;
  upperR: number;
  foreL: number;
  foreR: number;
  torso: number;
  head: number;
  thighL: number;
  thighR: number;
  shinL: number;
  shinR: number;
}

export interface BodyProfile {
  mode: BodyMode;
  /** 어깨너비 = 1 기준 비율 */
  ratios: BodyRatios;
  /** world z 차이 → '앞쪽(+)' 변환 부호 */
  fwdSign: Sign;
  /** 참고용 추정 어깨너비(cm). 단안 카메라 추정이라 절대값은 부정확할 수 있음 */
  shoulderCm: number | null;
  samples: number;
}

export type CalibMissing = 'person' | 'arms' | 'hips' | 'legs' | null;

export const CALIB_MS = 2000;

const DEFAULT_RATIOS: BodyRatios = {
  upperL: 0.8,
  upperR: 0.8,
  foreL: 0.72,
  foreR: 0.72,
  torso: 1.35,
  head: 0.6,
  thighL: 1.15,
  thighR: 1.15,
  shinL: 1.1,
  shinR: 1.1,
};

interface Sample {
  r: Partial<BodyRatios>;
  fwdVote: Sign | 0;
  shoulderM: number;
}

const ARM_JOINTS: JointRef[] = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST];
const LEG_JOINTS: JointRef[] = [LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE];

function checkMissing(f: PoseFrame | null, mode: BodyMode): CalibMissing {
  if (!f) return 'person';
  if (!ARM_JOINTS.every((j) => isVisible(f, j))) return 'arms';
  if (mode === 'full') {
    if (!isVisible(f, 'hipMid')) return 'hips';
    if (!LEG_JOINTS.every((j) => isVisible(f, j))) return 'legs';
  }
  return null;
}

function boneRatio(f: PoseFrame, a: JointRef, b: JointRef, ppm: number, shoulderPx: number): number {
  const inPlane = dist2(jointImg(f, a), jointImg(f, b));
  const depth = (jointWorld(f, b).z - jointWorld(f, a).z) * ppm;
  return Math.hypot(inPlane, depth) / shoulderPx;
}

function measure(f: PoseFrame, mode: BodyMode): Sample | null {
  const shoulderPx = dist2(f.img[LM.L_SHOULDER], f.img[LM.R_SHOULDER]);
  const shoulderM = dist3(f.world[LM.L_SHOULDER], f.world[LM.R_SHOULDER]);
  if (shoulderPx < 20 || shoulderM < 0.05) return null;
  const ppm = shoulderPx / shoulderM; // 픽셀/미터

  const r: Partial<BodyRatios> = {
    upperL: boneRatio(f, LM.L_SHOULDER, LM.L_ELBOW, ppm, shoulderPx),
    upperR: boneRatio(f, LM.R_SHOULDER, LM.R_ELBOW, ppm, shoulderPx),
    foreL: boneRatio(f, LM.L_ELBOW, LM.L_WRIST, ppm, shoulderPx),
    foreR: boneRatio(f, LM.R_ELBOW, LM.R_WRIST, ppm, shoulderPx),
  };
  // 상체 모드(휠체어·책상)에서는 엉덩이가 가려질 수 있다 → 보일 때만 몸통 측정
  if (isVisible(f, 'hipMid', 0.3)) r.torso = boneRatio(f, 'hipMid', 'shoulderMid', ppm, shoulderPx);
  if (isVisible(f, LM.NOSE)) r.head = dist2(f.img[LM.NOSE], jointImg(f, 'shoulderMid')) / shoulderPx;
  if (mode === 'full') {
    r.thighL = boneRatio(f, LM.L_HIP, LM.L_KNEE, ppm, shoulderPx);
    r.thighR = boneRatio(f, LM.R_HIP, LM.R_KNEE, ppm, shoulderPx);
    r.shinL = boneRatio(f, LM.L_KNEE, LM.L_ANKLE, ppm, shoulderPx);
    r.shinR = boneRatio(f, LM.R_KNEE, LM.R_ANKLE, ppm, shoulderPx);
  }

  // 코는 어깨보다 앞(카메라 쪽)에 있다 → 코의 z가 더 작으면 '카메라 쪽 = z 감소'
  const dz = f.world[LM.NOSE].z - jointWorld(f, 'shoulderMid').z;
  const fwdVote: Sign | 0 = Math.abs(dz) < 0.01 ? 0 : dz < 0 ? -1 : 1;

  return { r, fwdVote, shoulderM };
}

function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export class Calibrator {
  private samples: Sample[] = [];
  private validMs = 0;
  private lastT: number | null = null;
  missing: CalibMissing = 'person';

  constructor(readonly mode: BodyMode) {}

  get progress(): number {
    return Math.min(1, this.validMs / CALIB_MS);
  }

  get done(): boolean {
    return this.validMs >= CALIB_MS && this.samples.length >= 8;
  }

  /** 자세가 잘 보이는 프레임만 시간에 더한다(움직이거나 안 보이면 '일시정지', 처음부터 다시 하지 않음) */
  add(f: PoseFrame | null, now: number): void {
    const dt = this.lastT === null ? 0 : Math.min(100, now - this.lastT);
    this.lastT = now;
    this.missing = checkMissing(f, this.mode);
    if (this.missing || !f) return;
    const s = measure(f, this.mode);
    if (!s) return;
    this.samples.push(s);
    this.validMs += dt;
  }

  result(): BodyProfile {
    const ratios = { ...DEFAULT_RATIOS };
    for (const key of Object.keys(DEFAULT_RATIOS) as (keyof BodyRatios)[]) {
      const m = median(this.samples.map((s) => s.r[key] ?? NaN));
      if (m !== null) ratios[key] = Math.max(0.3, Math.min(3, m));
    }
    const votes = this.samples.reduce((acc, s) => acc + s.fwdVote, 0);
    const cm = median(this.samples.map((s) => s.shoulderM * 100));
    return {
      mode: this.mode,
      ratios,
      fwdSign: votes > 0 ? 1 : -1,
      shoulderCm: cm,
      samples: this.samples.length,
    };
  }
}
