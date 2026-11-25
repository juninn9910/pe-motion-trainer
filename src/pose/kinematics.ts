// 관절 각도 ↔ 방향 벡터 변환, 실제 뼈 방향 측정, 각도 오차 계산.
//
// ■ 해부학 좌표계 (학생 몸 기준, 좌우 대칭으로 정의)
//   o = 바깥쪽(몸 중심선에서 멀어지는 쪽, 몸통은 학생의 왼쪽)
//   u = 위쪽
//   f = 앞쪽(카메라를 향하는 쪽)
//
// ■ 목표 동작 각도 2개 (DirSpec)
//   raise : 정면(이마) 평면에서 '아래'로부터 바깥쪽으로 돌아간 각도.
//           0 = 아래로 늘어뜨림, 90 = 옆으로 수평, 180 = 머리 위, 음수 = 몸 안쪽
//   fwd   : 정면 평면에서 앞(카메라)으로 기운 각도. 0 = 평면 안, 90 = 정면으로 곧게
//
//   d = ( sin(raise)·cos(fwd),  −cos(raise)·cos(fwd),  sin(fwd) )
//
// 같은 각도 정의를 왼쪽·오른쪽에 그대로 쓰면 좌우 대칭 자세가 된다.

import type { Vec2 } from '../types';
import { LM, SEGMENTS, type SegKey, type SegSide } from './landmarks';
import { jointImg, jointWorld, type PoseFrame } from './poseFrame';

export interface AnatDir {
  o: number;
  u: number;
  f: number;
}

export interface DirSpec {
  raise: number;
  fwd: number;
}

export type Sign = 1 | -1;

const RAD = Math.PI / 180;

export function dirFromSpec(s: DirSpec): AnatDir {
  const r = s.raise * RAD;
  const p = s.fwd * RAD;
  return { o: Math.sin(r) * Math.cos(p), u: -Math.cos(r) * Math.cos(p), f: Math.sin(p) };
}

export function angleBetweenDeg(a: AnatDir, b: AnatDir): number {
  const na = Math.hypot(a.o, a.u, a.f) || 1;
  const nb = Math.hypot(b.o, b.u, b.f) || 1;
  const dot = (a.o * b.o + a.u * b.u + a.f * b.f) / (na * nb);
  return Math.acos(Math.max(-1, Math.min(1, dot))) / RAD;
}

/** 원본 카메라 영상에서 학생의 왼쪽이 +x 쪽에 있으면 1 (정면을 보고 있으면 보통 1) */
export function lateralSign2D(f: PoseFrame): Sign {
  return f.img[LM.L_SHOULDER].x >= f.img[LM.R_SHOULDER].x ? 1 : -1;
}

export function lateralSignWorld(f: PoseFrame): Sign {
  return f.world[LM.L_SHOULDER].x >= f.world[LM.R_SHOULDER].x ? 1 : -1;
}

/** 해부학 o(바깥쪽) 성분을 영상 x 방향으로 바꿀 때의 부호 */
export function outSign(side: SegSide, lat: Sign): Sign {
  return side === 'R' ? ((-lat) as Sign) : lat;
}

/**
 * 해부학 방향 → 영상 2D 방향(정사영). 앞쪽 성분 f는 화면에서 사라지므로
 * 길이가 cos(fwd)만큼 짧아진다 = 원근 단축(foreshortening)이 자동 반영된다.
 */
export function projectDir(d: AnatDir, side: SegSide, lat: Sign): Vec2 {
  return { x: d.o * outSign(side, lat), y: -d.u };
}

/**
 * 학생의 실제 뼈 방향 측정 (하이브리드).
 * - 화면 평면 안의 방향: 2D 영상 랜드마크 (가장 정확한 출력)
 * - 앞뒤 기울기 φ: world landmark 의 깊이(z)
 *   → 팔을 앞으로 뻗어 2D 길이가 0에 가까워져도 3D 방향을 잃지 않는다.
 *
 * @param fwdSign world z 변화량을 '앞쪽(+)'으로 바꾸는 부호. MediaPipe는 카메라에 가까울수록 z가 작으므로 −1.
 */
export function measureSegment(f: PoseFrame, seg: SegKey, fwdSign: Sign): AnatDir | null {
  const def = SEGMENTS[seg];
  const a2 = jointImg(f, def.from);
  const b2 = jointImg(f, def.to);
  const a3 = jointWorld(f, def.from);
  const b3 = jointWorld(f, def.to);

  const s2 = outSign(def.side, lateralSign2D(f));
  const sW = outSign(def.side, lateralSignWorld(f));

  const o2 = (b2.x - a2.x) * s2;
  const u2 = -(b2.y - a2.y);
  const n2 = Math.hypot(o2, u2);

  const o3 = (b3.x - a3.x) * sW;
  const u3 = -(b3.y - a3.y);
  const f3 = fwdSign * (b3.z - a3.z);
  if (Math.hypot(o3, u3, f3) < 1e-6) return null;

  const phi = Math.atan2(f3, Math.hypot(o3, u3)); // 정면 평면에서 앞으로 기운 각
  const c = Math.cos(phi);
  if (n2 < 1e-6) {
    // 2D에서 점으로 보임 = 거의 정면을 향함
    return { o: 0, u: 0, f: Math.sign(f3) || 1 };
  }
  return { o: (o2 / n2) * c, u: (u2 / n2) * c, f: Math.sin(phi) };
}
