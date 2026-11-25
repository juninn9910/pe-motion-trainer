// 조이콘 IMU 기반 스윙 감지.
// 스윙은 '빠른 회전'이므로 자이로 크기(deg/s)를 주 기준으로, 찌르기처럼 회전이 적은 동작은
// 가속도 변화량(g)으로 보조 판정한다. 한 번 감지하면 700ms 동안 중복 감지하지 않는다.

import type { Side } from '../types';
import type { ImuReading } from './JoyCon';

/** 기준 1(살짝) ~ 5(세게) */
const GYRO_DPS = [250, 450, 700, 1000, 1400];
const ACC_DEV_G = [0.7, 1.1, 1.6, 2.3, 3.0];
const REFRACTORY_MS = 700;

export function swingThreshold(level: number) {
  const i = Math.max(0, Math.min(4, Math.round(level) - 1));
  return { gyroDps: GYRO_DPS[i], accDevG: ACC_DEV_G[i] };
}

export class SwingDetector {
  private last = 0;

  constructor(
    private getLevel: () => number,
    private onSwing: (side: Side, strength: number) => void,
  ) {}

  feed(r: ImuReading): void {
    const th = swingThreshold(this.getLevel());
    const hit = r.gyroPeak >= th.gyroDps || r.accDevPeak >= th.accDevG;
    if (!hit || r.t - this.last < REFRACTORY_MS) return;
    this.last = r.t;
    this.onSwing(r.side, Math.max(r.gyroPeak / th.gyroDps, r.accDevPeak / th.accDevG));
  }
}
