// Joy-Con 한 개(L 또는 R)를 다루는 클래스.
// - 모든 출력 리포트를 한 줄로 직렬화(동시에 sendReport 하면 블루투스에서 유실·지연이 생김)
// - 진동은 '최신 값만' 보낸다: 보내는 중에 새 값이 오면 대기 중인 값만 갈아끼움
// - 패킷 카운터는 실제로 보내는 순간에 매겨서 0→15 순서가 깨지지 않게 함

import type { Side, Vec3 } from '../types';
import {
  PID_JOYCON_L,
  PID_JOYCON_R,
  REPORT_IN_FULL,
  REPORT_IN_SUBCMD_REPLY,
  REPORT_OUT_RUMBLE,
  REPORT_OUT_SUBCMD,
  RUMBLE_NEUTRAL,
  SUBCMD,
  buildRumble,
  buildSubcommand,
  parseBattery,
  parseImu,
  type Battery,
} from './protocol';

export interface ImuReading {
  side: Side;
  /** 마지막 샘플 */
  acc: Vec3;
  gyro: Vec3;
  /** 이번 리포트(3샘플) 중 최대값 */
  gyroPeak: number;
  /** |가속도| − 1g 의 최대 절댓값 (중력 제외 흔들림) */
  accDevPeak: number;
  t: number;
}

export function sideOfProduct(productId: number): Side | null {
  if (productId === PID_JOYCON_L) return 'L';
  if (productId === PID_JOYCON_R) return 'R';
  return null;
}

export class JoyCon {
  readonly side: Side;
  battery: Battery | null = null;
  lastImu: ImuReading | null = null;
  ready = false;
  alive = true;

  private counter = 0;
  private chain: Promise<void> = Promise.resolve();
  private latestRumble: readonly number[] = RUMBLE_NEUTRAL;
  private rumbleQueued = false;
  private replyWaiters = new Map<number, () => void>();
  private imuListeners = new Set<(r: ImuReading) => void>();

  constructor(readonly device: HIDDevice) {
    const side = sideOfProduct(device.productId);
    if (!side) throw new Error('Joy-Con이 아닌 장치입니다.');
    this.side = side;
  }

  get name(): string {
    return this.device.productName || (this.side === 'L' ? 'Joy-Con (L)' : 'Joy-Con (R)');
  }

  /** 연결 직후 초기화: 진동 켜기(0x48) → IMU 켜기(0x40) → 전체 입력 모드(0x03, 0x30) → LED */
  async init(): Promise<void> {
    if (!this.device.opened) await this.device.open();
    this.device.addEventListener('inputreport', this.onInput);
    await this.subcommand(SUBCMD.ENABLE_VIBRATION, [0x01]);
    await this.subcommand(SUBCMD.ENABLE_IMU, [0x01]);
    await this.subcommand(SUBCMD.SET_INPUT_MODE, [0x30]);
    await this.subcommand(SUBCMD.SET_PLAYER_LIGHTS, [this.side === 'L' ? 0x01 : 0x08]);
    this.ready = true;
  }

  onImu(fn: (r: ImuReading) => void): () => void {
    this.imuListeners.add(fn);
    return () => this.imuListeners.delete(fn);
  }

  /** 진동 4바이트(encodeRumble 결과)를 보낸다. 이전 값이 아직 안 나갔으면 덮어쓴다 */
  rumble(bytes: readonly number[]): void {
    this.latestRumble = bytes;
    if (this.rumbleQueued) return;
    this.rumbleQueued = true;
    void this.enqueue(async () => {
      this.rumbleQueued = false;
      await this.device.sendReport(REPORT_OUT_RUMBLE, buildRumble(this.nextCounter(), this.latestRumble));
    }).catch(() => {});
  }

  async close(): Promise<void> {
    if (!this.alive) return;
    try {
      this.rumble(RUMBLE_NEUTRAL);
      await this.chain;
    } catch {
      /* ignore */
    }
    this.alive = false;
    this.device.removeEventListener('inputreport', this.onInput);
    try {
      if (this.device.opened) await this.device.close();
    } catch {
      /* ignore */
    }
  }

  /** 서브커맨드 전송 후 0x21 응답을 최대 400ms 기다린다(응답이 없어도 진행) */
  private async subcommand(id: number, args: readonly number[]): Promise<void> {
    const replied = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 400);
      this.replyWaiters.set(id, () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await this.enqueue(() => this.device.sendReport(REPORT_OUT_SUBCMD, buildSubcommand(this.nextCounter(), id, args)));
    await replied;
    this.replyWaiters.delete(id);
  }

  private nextCounter(): number {
    const c = this.counter;
    this.counter = (c + 1) & 0x0f;
    return c;
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const job = this.chain.then(() => {
      if (!this.alive || !this.device.opened) return;
      return fn();
    });
    this.chain = job.catch((err) => console.warn(`[JoyCon ${this.side}] 전송 실패`, err));
    return job;
  }

  private onInput = (e: HIDInputReportEvent) => {
    const { reportId, data } = e;
    if (reportId === REPORT_IN_FULL) {
      this.battery = parseBattery(data) ?? this.battery;
      const samples = parseImu(data);
      if (!samples.length) return;
      let gyroPeak = 0;
      let accDevPeak = 0;
      for (const s of samples) {
        gyroPeak = Math.max(gyroPeak, Math.hypot(s.gyro.x, s.gyro.y, s.gyro.z));
        accDevPeak = Math.max(accDevPeak, Math.abs(Math.hypot(s.acc.x, s.acc.y, s.acc.z) - 1));
      }
      const last = samples[samples.length - 1];
      const reading: ImuReading = { side: this.side, acc: last.acc, gyro: last.gyro, gyroPeak, accDevPeak, t: performance.now() };
      this.lastImu = reading;
      this.imuListeners.forEach((fn) => fn(reading));
    } else if (reportId === REPORT_IN_SUBCMD_REPLY && data.byteLength >= 14) {
      this.battery = parseBattery(data) ?? this.battery;
      this.replyWaiters.get(data.getUint8(13))?.();
    }
  };
}
