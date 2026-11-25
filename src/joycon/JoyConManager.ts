// 왼쪽/오른쪽 Joy-Con 연결 관리 (각각 독립적으로 연결·해제).

import type { Side } from '../types';
import { JoyCon, sideOfProduct, type ImuReading } from './JoyCon';
import { NINTENDO_VENDOR_ID, PID_JOYCON_L, PID_JOYCON_R, RUMBLE_NEUTRAL } from './protocol';

type Listener = () => void;
type ImuListener = (r: ImuReading) => void;

function isJoyCon(d: HIDDevice): boolean {
  return d.vendorId === NINTENDO_VENDOR_ID && sideOfProduct(d.productId) !== null;
}

export class JoyConManager {
  readonly supported = typeof navigator !== 'undefined' && 'hid' in navigator && window.isSecureContext;
  private pads: Partial<Record<Side, JoyCon>> = {};
  private listeners = new Set<Listener>();
  private imuListeners = new Set<ImuListener>();
  private version = 0;
  lastError: string | null = null;

  constructor() {
    if (this.supported) {
      navigator.hid.addEventListener('disconnect', this.onDisconnect);
      navigator.hid.addEventListener('connect', this.onConnect);
    }
  }

  get(side: Side): JoyCon | undefined {
    return this.pads[side];
  }

  /** React useSyncExternalStore 용 */
  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;

  onImu(fn: ImuListener): () => void {
    this.imuListeners.add(fn);
    return () => this.imuListeners.delete(fn);
  }

  /** 브라우저 장치 선택 창을 띄운다 (반드시 버튼 클릭 등 사용자 동작 안에서 호출) */
  async request(side: Side): Promise<void> {
    if (!this.supported) throw new Error('이 브라우저는 WebHID를 지원하지 않습니다. Chrome 또는 Edge를 쓰세요.');
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: NINTENDO_VENDOR_ID, productId: side === 'L' ? PID_JOYCON_L : PID_JOYCON_R }],
    });
    for (const d of devices) await this.attach(d);
  }

  /** 이전에 허용한 Joy-Con을 자동으로 다시 연결 (권한 창 없음) */
  async autoConnect(): Promise<void> {
    if (!this.supported) return;
    const devices = await navigator.hid.getDevices();
    for (const d of devices) if (isJoyCon(d)) await this.attach(d).catch(() => {});
  }

  async disconnect(side: Side): Promise<void> {
    const pad = this.pads[side];
    if (!pad) return;
    delete this.pads[side];
    this.emit();
    await pad.close();
  }

  rumble(side: Side, bytes: readonly number[]): void {
    const pad = this.pads[side];
    if (pad?.ready) pad.rumble(bytes);
  }

  stopAll(): void {
    (['L', 'R'] as Side[]).forEach((s) => this.rumble(s, RUMBLE_NEUTRAL));
  }

  private async attach(device: HIDDevice): Promise<void> {
    const side = sideOfProduct(device.productId);
    if (!side) return;
    const existing = this.pads[side];
    if (existing?.device === device && existing.alive) return;
    if (existing) await existing.close();

    const pad = new JoyCon(device);
    pad.onImu((r) => this.imuListeners.forEach((fn) => fn(r)));
    this.pads[side] = pad;
    this.lastError = null;
    this.emit();
    try {
      await pad.init();
    } catch (err) {
      console.warn(`[JoyConManager] ${side} 초기화 실패`, err);
      this.lastError = `${side === 'L' ? '왼쪽' : '오른쪽'} 조이콘 초기화 실패: ${(err as Error).message}`;
      if (this.pads[side] === pad) delete this.pads[side];
      await pad.close();
    }
    this.emit();
  }

  private onDisconnect = (e: HIDConnectionEvent) => {
    for (const side of ['L', 'R'] as Side[]) {
      const pad = this.pads[side];
      if (pad?.device === e.device) {
        pad.alive = false;
        delete this.pads[side];
        this.emit();
      }
    }
  };

  /** 이미 권한을 준 Joy-Con이 다시 켜지면 자동 재연결 */
  private onConnect = (e: HIDConnectionEvent) => {
    if (isJoyCon(e.device)) void this.attach(e.device).catch(() => {});
  };

  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
}

export const joycons = new JoyConManager();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => joycons.stopAll());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) joycons.stopAll();
  });
}
