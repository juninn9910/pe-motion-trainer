// 촉각 피드백 패턴과 재생기.
// - 좌/우 독립 재생, 우선순위(축하·타격 > 준비 > 일치 톡 > 유지 박동)
// - 실제 조이콘이 없어도 onPulse 로 화면에 '진동 표시'를 띄운다 (카메라 단독 테스트용)

import type { Side } from '../types';
import { encodeRumble, RUMBLE_NEUTRAL } from './protocol';

export interface RumbleFrame {
  ms: number;
  amp: number;
  hf?: number;
  lf?: number;
}

type Target = Side | 'both';
export type PatternName = 'tick' | 'heartbeat' | 'ready' | 'impact' | 'celebrate' | 'testSoft' | 'testStrong';

const PRIORITY: Record<PatternName, number> = {
  heartbeat: 0,
  tick: 1,
  testSoft: 2,
  testStrong: 2,
  ready: 3,
  impact: 4,
  celebrate: 4,
};

const off = (ms: number): RumbleFrame => ({ ms, amp: 0 });

/** 좌우 같은 패턴 */
const SAME: Partial<Record<PatternName, RumbleFrame[]>> = {
  // 부위가 가이드에 '딱' 들어간 순간
  tick: [{ ms: 70, amp: 0.45, hf: 320, lf: 160 }],
  // 자세를 유지하는 동안 0.55초마다 약한 박동
  heartbeat: [{ ms: 50, amp: 0.2, hf: 250, lf: 130 }],
  // 콤보 1단계 '준비 완료!' — 짧고 높은 두 번
  ready: [{ ms: 70, amp: 0.55, hf: 600, lf: 300 }, off(70), { ms: 70, amp: 0.55, hf: 600, lf: 300 }],
  // 스윙 타격 — 저주파 묵직하게 시작해 감쇠
  impact: [
    { ms: 60, amp: 1.0, hf: 180, lf: 80 },
    { ms: 70, amp: 0.75, hf: 160, lf: 70 },
    { ms: 80, amp: 0.45, hf: 140, lf: 60 },
    { ms: 80, amp: 0.2, hf: 120, lf: 50 },
  ],
  testSoft: [{ ms: 300, amp: 0.3, hf: 320, lf: 160 }],
  testStrong: [{ ms: 400, amp: 0.85, hf: 200, lf: 100 }],
};

/** 축하: 왼-오-왼-오-왼-오 핑퐁 후 양쪽 크게 */
const CELEBRATE: Record<Side, RumbleFrame[]> = (() => {
  const hit: RumbleFrame = { ms: 90, amp: 0.7, hf: 500, lf: 250 };
  const big: RumbleFrame = { ms: 300, amp: 0.9, hf: 300, lf: 150 };
  return {
    L: [hit, off(90), hit, off(90), hit, off(90), big],
    R: [off(90), hit, off(90), hit, off(90), hit, big],
  };
})();

/** 50ms 넘는 프레임은 잘게 나눠 재전송 (블루투스 유실 대비) */
function chunk(frames: RumbleFrame[]): RumbleFrame[] {
  const out: RumbleFrame[] = [];
  for (const f of frames) {
    let left = f.ms;
    while (left > 0) {
      const ms = Math.min(50, left);
      out.push({ ...f, ms });
      left -= ms;
    }
  }
  return out;
}

class SidePlayer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private priority = -1;
  private busyUntil = 0;

  constructor(
    private side: Side,
    private send: (side: Side, bytes: readonly number[]) => void,
    private pulse: (side: Side, strength: number) => void,
  ) {}

  play(frames: RumbleFrame[], priority: number, intensity: number) {
    const now = performance.now();
    if (now < this.busyUntil && priority < this.priority) return;
    this.cancel();
    this.priority = priority;
    this.busyUntil = now + frames.reduce((s, f) => s + f.ms, 0);
    const seq = chunk(frames);
    let i = 0;
    let lastAmp = -1;
    const step = () => {
      if (i >= seq.length) {
        this.send(this.side, RUMBLE_NEUTRAL);
        this.priority = -1;
        this.timer = null;
        return;
      }
      const f = seq[i++];
      const amp = f.amp * intensity;
      this.send(this.side, amp > 0 ? encodeRumble(f.hf ?? 320, amp, f.lf ?? 160, amp) : RUMBLE_NEUTRAL);
      if (amp > 0 && amp !== lastAmp) this.pulse(this.side, f.amp);
      lastAmp = amp;
      this.timer = setTimeout(step, f.ms);
    };
    step();
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  stop() {
    this.cancel();
    this.priority = -1;
    this.busyUntil = 0;
    this.send(this.side, RUMBLE_NEUTRAL);
  }
}

export class Haptics {
  /** 진동 세기 0~1 (교사 패널) */
  intensity = 0.7;
  private players: Record<Side, SidePlayer>;
  private zone: Record<Side, boolean> = { L: false, R: false };
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pulseListeners = new Set<(side: Side, strength: number) => void>();

  constructor(send: (side: Side, bytes: readonly number[]) => void) {
    const pulse = (side: Side, strength: number) => this.pulseListeners.forEach((fn) => fn(side, strength));
    this.players = { L: new SidePlayer('L', send, pulse), R: new SidePlayer('R', send, pulse) };
  }

  onPulse(fn: (side: Side, strength: number) => void): () => void {
    this.pulseListeners.add(fn);
    return () => this.pulseListeners.delete(fn);
  }

  play(target: Target, name: PatternName) {
    const sides: Side[] = target === 'both' ? ['L', 'R'] : [target];
    for (const s of sides) {
      const frames = name === 'celebrate' ? CELEBRATE[s] : SAME[name];
      if (frames) this.players[s].play(frames, PRIORITY[name], this.intensity);
    }
  }

  /** 부위 일치 구역 진입/이탈. 진입 순간 '톡', 유지 중에는 약한 박동 */
  setZone(side: Side, on: boolean) {
    if (on && !this.zone[side]) this.play(side, 'tick');
    this.zone[side] = on;
    const any = this.zone.L || this.zone.R;
    if (any && !this.heartbeat) {
      this.heartbeat = setInterval(() => {
        (['L', 'R'] as Side[]).forEach((s) => this.zone[s] && this.play(s, 'heartbeat'));
      }, 550);
    } else if (!any && this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  clearZones() {
    this.setZone('L', false);
    this.setZone('R', false);
  }

  stopAll() {
    this.clearZones();
    this.players.L.stop();
    this.players.R.stop();
  }
}
