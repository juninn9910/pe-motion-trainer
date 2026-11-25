import type { Vec2, Vec3 } from '../types';
import { LM, type JointRef } from './landmarks';

/** MediaPipe 결과(정규화 좌표 0~1)를 그대로 담은 것 */
export interface RawPose {
  img: Vec2[];
  world: Vec3[];
  vis: number[];
}

/**
 * 한 프레임의 자세.
 * - img: 영상 픽셀 좌표(거울 반전 전, 원본 카메라 기준)
 * - world: MediaPipe world landmark (미터, 엉덩이 중심 원점, z 작을수록 카메라에 가까움)
 */
export interface PoseFrame {
  img: Vec2[];
  world: Vec3[];
  vis: number[];
  width: number;
  height: number;
}

const mid2 = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const mid3 = (a: Vec3, b: Vec3): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

export function jointImg(f: PoseFrame, j: JointRef): Vec2 {
  if (j === 'hipMid') return mid2(f.img[LM.L_HIP], f.img[LM.R_HIP]);
  if (j === 'shoulderMid') return mid2(f.img[LM.L_SHOULDER], f.img[LM.R_SHOULDER]);
  return f.img[j];
}

export function jointWorld(f: PoseFrame, j: JointRef): Vec3 {
  if (j === 'hipMid') return mid3(f.world[LM.L_HIP], f.world[LM.R_HIP]);
  if (j === 'shoulderMid') return mid3(f.world[LM.L_SHOULDER], f.world[LM.R_SHOULDER]);
  return f.world[j];
}

export function jointVis(f: PoseFrame, j: JointRef): number {
  if (j === 'hipMid') return Math.min(f.vis[LM.L_HIP], f.vis[LM.R_HIP]);
  if (j === 'shoulderMid') return Math.min(f.vis[LM.L_SHOULDER], f.vis[LM.R_SHOULDER]);
  return f.vis[j];
}

/** 화면 안에 있고 가시도가 충분한 관절인가 */
export function isVisible(f: PoseFrame, j: JointRef, min = 0.5): boolean {
  if (jointVis(f, j) < min) return false;
  const p = jointImg(f, j);
  const mx = f.width * 0.03;
  const my = f.height * 0.03;
  return p.x > -mx && p.x < f.width + mx && p.y > -my && p.y < f.height + my;
}

export function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * 지수이동평균(EMA) 떨림 보정. 손떨림이 있는 학생에게도 가이드가 덜 흔들리게 한다.
 * (스윙 감지는 카메라가 아니라 조이콘 IMU로 하므로 약간의 지연은 문제 없음)
 */
export class PoseSmoother {
  private prev: PoseFrame | null = null;
  constructor(private alpha = 0.5) {}

  reset() {
    this.prev = null;
  }

  update(raw: RawPose | null, width: number, height: number): PoseFrame | null {
    if (!raw) {
      this.prev = null;
      return null;
    }
    const img = raw.img.map((p) => ({ x: p.x * width, y: p.y * height }));
    const p = this.prev;
    if (!p || p.width !== width || p.height !== height || p.img.length !== img.length) {
      this.prev = { img, world: raw.world, vis: raw.vis, width, height };
      return this.prev;
    }
    const a = this.alpha;
    const b = 1 - a;
    const next: PoseFrame = {
      img: img.map((q, i) => ({ x: a * q.x + b * p.img[i].x, y: a * q.y + b * p.img[i].y })),
      world: raw.world.map((q, i) => ({
        x: a * q.x + b * p.world[i].x,
        y: a * q.y + b * p.world[i].y,
        z: a * q.z + b * p.world[i].z,
      })),
      vis: raw.vis.map((v, i) => a * v + b * p.vis[i]),
      width,
      height,
    };
    this.prev = next;
    return next;
  }
}
