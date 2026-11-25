// 카메라 없이 화면·판정·피드백을 점검하기 위한 가상 학생 (주소 뒤에 ?sim 을 붙이면 사용).
// 차렷(3초, 캘리브레이션) → 목표 동작으로 이동 → 3초 유지 → 복귀 를 반복한다.

import type { Vec3 } from '../types';
import { dirFromSpec, type AnatDir } from './kinematics';
import { LM, type SegKey, type SegSide } from './landmarks';
import type { PoseFrame } from './poseFrame';
import { NEUTRAL_TARGETS, type PresetDef } from './presets';

const DIMS = { shoulder: 0.36, hipW: 0.24, upper: 0.29, fore: 0.26, torso: 0.5, thigh: 0.43, shin: 0.41, neck: 0.2 };

/** 해부학 방향 → MediaPipe world 좌표 (학생 왼쪽 = +x, 아래 = +y, 카메라 쪽 = −z) */
function toWorld(d: AnatDir, side: SegSide): Vec3 {
  const s = side === 'R' ? -1 : 1;
  return { x: d.o * s, y: -d.u, z: -d.f };
}
const along = (a: Vec3, d: Vec3, k: number): Vec3 => ({ x: a.x + d.x * k, y: a.y + d.y * k, z: a.z + d.z * k });
const smooth = (x: number) => x * x * (3 - 2 * x);

function blendAt(t: number): number {
  if (t < 3) return 0;
  const c = (t - 3) % 7;
  if (c < 1.2) return smooth(c / 1.2);
  if (c < 4.2) return 1;
  if (c < 5.2) return 1 - smooth((c - 4.2) / 1.0);
  return 0;
}

export class PoseSimulator {
  private t0: number | null = null;

  restart() {
    this.t0 = null;
  }

  frame(now: number, preset: PresetDef, width = 1280, height = 720): PoseFrame {
    if (this.t0 === null) this.t0 = now;
    const t = (now - this.t0) / 1000;
    const k = blendAt(t);
    const dir = (seg: SegKey): AnatDir => {
      const a = NEUTRAL_TARGETS[seg];
      const b = preset.targets[seg];
      const wobble = Math.sin(t * 1.7 + seg.length) * 2.5;
      return dirFromSpec({ raise: a.raise + (b.raise - a.raise) * k + wobble, fwd: a.fwd + (b.fwd - a.fwd) * k + wobble * 0.5 });
    };

    const hipMid: Vec3 = { x: 0, y: 0, z: 0 };
    const torsoW = toWorld(dir('torso'), 'C');
    const shMid = along(hipMid, torsoW, DIMS.torso);
    const lSh = along(shMid, { x: 1, y: 0, z: 0 }, DIMS.shoulder / 2);
    const rSh = along(shMid, { x: -1, y: 0, z: 0 }, DIMS.shoulder / 2);
    const lEl = along(lSh, toWorld(dir('lUpper'), 'L'), DIMS.upper);
    const lWr = along(lEl, toWorld(dir('lFore'), 'L'), DIMS.fore);
    const rEl = along(rSh, toWorld(dir('rUpper'), 'R'), DIMS.upper);
    const rWr = along(rEl, toWorld(dir('rFore'), 'R'), DIMS.fore);
    const lHip: Vec3 = { x: DIMS.hipW / 2, y: 0, z: 0 };
    const rHip: Vec3 = { x: -DIMS.hipW / 2, y: 0, z: 0 };
    const lKn = along(lHip, toWorld(dir('lThigh'), 'L'), DIMS.thigh);
    const lAn = along(lKn, toWorld(dir('lShin'), 'L'), DIMS.shin);
    const rKn = along(rHip, toWorld(dir('rThigh'), 'R'), DIMS.thigh);
    const rAn = along(rKn, toWorld(dir('rShin'), 'R'), DIMS.shin);
    const nose = along(along(shMid, torsoW, DIMS.neck), { x: 0, y: 0, z: -1 }, 0.08);

    const world: Vec3[] = new Array(33).fill(nose);
    world[LM.L_SHOULDER] = lSh;
    world[LM.R_SHOULDER] = rSh;
    world[LM.L_ELBOW] = lEl;
    world[LM.R_ELBOW] = rEl;
    for (const i of [LM.L_WRIST, 17, 19, 21]) world[i] = lWr;
    for (const i of [LM.R_WRIST, 18, 20, 22]) world[i] = rWr;
    world[LM.L_HIP] = lHip;
    world[LM.R_HIP] = rHip;
    world[LM.L_KNEE] = lKn;
    world[LM.R_KNEE] = rKn;
    for (const i of [LM.L_ANKLE, 29, 31]) world[i] = lAn;
    for (const i of [LM.R_ANKLE, 30, 32]) world[i] = rAn;

    const ppm = height / 2.1;
    const cx = width / 2 + Math.sin(t * 0.4) * 20;
    const cy = height * 0.55;
    return {
      img: world.map((p) => ({ x: cx + p.x * ppm, y: cy + p.y * ppm })),
      world,
      vis: world.map(() => 0.98),
      width,
      height,
    };
  }
}
