// 부위별 일치 판정 + 유지 시간/콤보 상태기계.

import type { BodyMode, Side } from '../types';
import type { BodyProfile } from './calibration';
import { angleBetweenDeg, dirFromSpec, measureSegment } from './kinematics';
import { LOWER_PARTS, PART_KEYS, PART_SEGMENTS, SEGMENTS, type PartKey, type SegKey } from './landmarks';
import { isVisible, type PoseFrame } from './poseFrame';
import type { PresetDef } from './presets';

/** match=일치, miss=불일치, unknown=안 보임, off=이번 동작에서 판정 안 함 */
export type PartStatus = 'match' | 'miss' | 'unknown' | 'off';

export interface Evaluation {
  parts: Record<PartKey, PartStatus>;
  /** 뼈별 목표와의 3D 각도 오차(도) */
  segErr: Partial<Record<SegKey, number>>;
  /** 판정 대상 부위가 전부 일치 */
  allMatched: boolean;
}

export function judgedParts(preset: PresetDef, mode: BodyMode): PartKey[] {
  return preset.judged.filter((p) => mode === 'full' || !LOWER_PARTS.includes(p));
}

export function evaluate(
  frame: PoseFrame,
  profile: BodyProfile,
  preset: PresetDef,
  mode: BodyMode,
  toleranceDeg: number,
): Evaluation {
  const judged = judgedParts(preset, mode);
  const parts = Object.fromEntries(PART_KEYS.map((p) => [p, 'off'])) as Record<PartKey, PartStatus>;
  const segErr: Partial<Record<SegKey, number>> = {};

  for (const part of judged) {
    let status: PartStatus = 'match';
    for (const seg of PART_SEGMENTS[part]) {
      const def = SEGMENTS[seg];
      if (!isVisible(frame, def.from) || !isVisible(frame, def.to)) {
        status = 'unknown';
        continue;
      }
      const measured = measureSegment(frame, seg, profile.fwdSign);
      if (!measured) {
        status = 'unknown';
        continue;
      }
      const err = angleBetweenDeg(measured, dirFromSpec(preset.targets[seg]));
      segErr[seg] = err;
      if (err > toleranceDeg && status === 'match') status = 'miss';
    }
    parts[part] = status;
  }

  const allMatched = judged.length > 0 && judged.every((p) => parts[p] === 'match');
  return { parts, segErr, allMatched };
}

/**
 * 좌/우 조이콘 진동 구역.
 * 팔을 판정하는 동작: 왼팔 일치 → L, 오른팔 일치 → R (좌우 독립)
 * 팔을 판정하지 않는 동작(몸 수그리기): 판정 부위 전부 일치 → L·R 동시
 */
export function hapticZones(ev: Evaluation): Record<Side, boolean> {
  const armsJudged = ev.parts.leftArm !== 'off' || ev.parts.rightArm !== 'off';
  if (armsJudged) {
    return { L: ev.parts.leftArm === 'match', R: ev.parts.rightArm === 'match' };
  }
  return { L: ev.allMatched, R: ev.allMatched };
}

export type Stage = 'pose' | 'ready' | 'cooldown';
export type SessionEvent = 'success' | 'ready' | 'hit' | 'readyTimeout' | 'swingIgnored';

/** 잠깐 흔들려 판정이 끊겨도 유지 시간을 바로 0으로 돌리지 않는 여유(ms) — 떨림이 있는 학생 배려 */
const GRACE_MS = 250;
const COOLDOWN_MS = 1500;
export const READY_WINDOW_MS = 5000;

export class Session {
  stage: Stage = 'pose';
  stars = 0;
  /** 유지 진행률 0~1 */
  progress = 0;
  /** 콤보 준비 상태 남은 비율 1→0 */
  readyLeft = 0;
  private holdStart: number | null = null;
  private lastMatch = 0;
  private stageUntil = 0;

  reset(keepStars = true) {
    this.stage = 'pose';
    this.progress = 0;
    this.readyLeft = 0;
    this.holdStart = null;
    if (!keepStars) this.stars = 0;
  }

  update(ev: Evaluation | null, now: number, holdMs: number, combo: boolean): SessionEvent[] {
    const out: SessionEvent[] = [];

    if (this.stage === 'cooldown') {
      if (now >= this.stageUntil) this.reset();
      return out;
    }

    if (this.stage === 'ready') {
      // 스윙하는 동안 자세가 무너지는 게 정상이므로 준비 상태는 시간으로만 유지
      this.readyLeft = Math.max(0, (this.stageUntil - now) / READY_WINDOW_MS);
      if (now >= this.stageUntil) {
        this.reset();
        out.push('readyTimeout');
      }
      return out;
    }

    if (ev?.allMatched) {
      this.lastMatch = now;
      if (this.holdStart === null) this.holdStart = now;
    } else if (this.holdStart !== null && now - this.lastMatch > GRACE_MS) {
      this.holdStart = null;
    }

    this.progress = this.holdStart === null ? 0 : Math.min(1, (now - this.holdStart) / holdMs);

    if (this.progress >= 1) {
      this.holdStart = null;
      this.progress = 0;
      if (combo) {
        this.stage = 'ready';
        this.stageUntil = now + READY_WINDOW_MS;
        this.readyLeft = 1;
        out.push('ready');
      } else {
        this.stars += 1;
        this.stage = 'cooldown';
        this.stageUntil = now + COOLDOWN_MS;
        out.push('success');
      }
    }
    return out;
  }

  swing(now: number): SessionEvent[] {
    if (this.stage !== 'ready') return ['swingIgnored'];
    this.stars += 1;
    this.stage = 'cooldown';
    this.stageUntil = now + COOLDOWN_MS;
    this.readyLeft = 0;
    return ['hit'];
  }
}
