// Nintendo Switch Joy-Con HID 프로토콜 (블루투스 HID, WebHID 기준).
// 참고: dekuNukem/Nintendo_Switch_Reverse_Engineering (bluetooth_hid_notes, rumble_data_table)
//
// ■ 출력 리포트 (PC → Joy-Con). WebHID sendReport(reportId, data)의 data에는 리포트 ID가 빠진다.
//   0x01 진동 + 서브커맨드
//     [0]    패킷 카운터 (0x0~0xF 순환, 매 출력 리포트마다 +1)
//     [1-4]  왼쪽 진동 데이터 4바이트
//     [5-8]  오른쪽 진동 데이터 4바이트
//     [9]    서브커맨드 ID
//     [10~]  서브커맨드 인자
//   0x10 진동만
//     [0]    패킷 카운터
//     [1-8]  진동 데이터 (L 4바이트 + R 4바이트)
//   → Joy-Con L은 앞 4바이트, R은 뒤 4바이트를 읽는다. 단일 Joy-Con에 보내도 양쪽에 같은 값을 넣는다.
//
// ■ 입력 리포트 (Joy-Con → PC). event.data 역시 리포트 ID가 빠진 상태.
//   0x21 서브커맨드 응답: [12] ACK, [13] 응답한 서브커맨드 ID
//   0x30 표준 전체 모드(60Hz): [1] 배터리, [12~47] IMU 3샘플 × (가속도 xyz + 자이로 xyz, int16 LE)

import type { Vec3 } from '../types';

export const NINTENDO_VENDOR_ID = 0x057e;
export const PID_JOYCON_L = 0x2006;
export const PID_JOYCON_R = 0x2007;

export const REPORT_OUT_SUBCMD = 0x01;
export const REPORT_OUT_RUMBLE = 0x10;
export const REPORT_IN_SUBCMD_REPLY = 0x21;
export const REPORT_IN_FULL = 0x30;

export const SUBCMD = {
  /** 입력 리포트 모드. 인자 0x30 = 표준 전체 모드(IMU 포함 60Hz 스트리밍) */
  SET_INPUT_MODE: 0x03,
  /** 플레이어 LED. 하위 4비트 = 켜짐, 상위 4비트 = 깜박임 */
  SET_PLAYER_LIGHTS: 0x30,
  /** IMU(6축 센서) 켜기. 인자 0x01 */
  ENABLE_IMU: 0x40,
  /** 진동 모터 켜기. 인자 0x01 */
  ENABLE_VIBRATION: 0x48,
} as const;

/** 진동 없음: HF 320Hz / LF 160Hz, 세기 0 */
export const RUMBLE_NEUTRAL: readonly number[] = [0x00, 0x01, 0x40, 0x40];

/** 액추에이터 보호용 상한. 1.003을 넘는 세기는 하드웨어 손상 위험이 보고되어 있다 */
export const MAX_SAFE_AMP = 1.0;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 주파수(Hz) → 7비트 로그 스케일 값: round(log2(f/10) × 32) */
function encodeFreq(hz: number): number {
  return Math.round(Math.log2(hz / 10) * 32);
}

/** 세기(0~1) → 진폭 코드(0~100). 구간별 로그 근사 */
export function encodeAmp(amp: number): number {
  const a = clamp(amp, 0, MAX_SAFE_AMP);
  if (a < 0.01) return 0;
  if (a > 0.23) return Math.round(Math.log2(a * 8.7) * 32);
  if (a > 0.12) return Math.round(Math.log2(a * 17) * 16);
  return Math.round(Math.log2(a * 100) * 4) + 1;
}

/**
 * HD 진동 4바이트 인코딩. 고주파(HF)·저주파(LF) 두 대역을 각각의 세기로 섞는다.
 *   byte0 = HF 하위 8비트
 *   byte1 = HF 상위 1비트 + HF 진폭(짝수, 0x00~0xC8)
 *   byte2 = LF 주파수(0x01~0x7F) + LF 진폭 상위비트
 *   byte3 = LF 진폭(0x40~0x72)
 */
export function encodeRumble(hfHz: number, hfAmp: number, lfHz: number, lfAmp: number): number[] {
  const hfCode = clamp(encodeFreq(clamp(hfHz, 81.75, 1252)), 0x61, 0xdf);
  const lfCode = clamp(encodeFreq(clamp(lfHz, 40.875, 626.5)), 0x41, 0xbf);
  const hf = (hfCode - 0x60) * 4; // 0x0004 ~ 0x01FC
  const lf = lfCode - 0x40; // 0x01 ~ 0x7F
  const hfAmpByte = encodeAmp(hfAmp) * 2; // 0x00 ~ 0xC8
  const lfAmpWord = (encodeAmp(lfAmp) >> 1) + 0x40; // 0x40 ~ 0x72
  return [hf & 0xff, ((hf >> 8) & 0xff) + hfAmpByte, lf + ((lfAmpWord >> 8) & 0xff), lfAmpWord & 0xff];
}

export function buildSubcommand(counter: number, id: number, args: readonly number[]): Uint8Array<ArrayBuffer> {
  return new Uint8Array([counter & 0x0f, ...RUMBLE_NEUTRAL, ...RUMBLE_NEUTRAL, id, ...args]);
}

export function buildRumble(counter: number, rumble: readonly number[]): Uint8Array<ArrayBuffer> {
  return new Uint8Array([counter & 0x0f, ...rumble, ...rumble]);
}

/** 가속도 ±8G 기본 감도: 1 LSB = 8/32768 g */
export const ACC_G_PER_LSB = 8 / 32768;
/** 자이로 ±2000dps 기본 감도: 1 LSB ≈ 0.061 dps */
export const GYRO_DPS_PER_LSB = 2000 / 32767;

export interface ImuSample {
  acc: Vec3; // g
  gyro: Vec3; // deg/s
}

export function parseImu(data: DataView): ImuSample[] {
  const out: ImuSample[] = [];
  for (let i = 0; i < 3; i++) {
    const b = 12 + i * 12;
    if (b + 12 > data.byteLength) break;
    out.push({
      acc: {
        x: data.getInt16(b, true) * ACC_G_PER_LSB,
        y: data.getInt16(b + 2, true) * ACC_G_PER_LSB,
        z: data.getInt16(b + 4, true) * ACC_G_PER_LSB,
      },
      gyro: {
        x: data.getInt16(b + 6, true) * GYRO_DPS_PER_LSB,
        y: data.getInt16(b + 8, true) * GYRO_DPS_PER_LSB,
        z: data.getInt16(b + 10, true) * GYRO_DPS_PER_LSB,
      },
    });
  }
  return out;
}

export interface Battery {
  /** 0(없음) ~ 4(가득) */
  level: number;
  charging: boolean;
}

export function parseBattery(data: DataView): Battery | null {
  if (data.byteLength < 2) return null;
  const nibble = data.getUint8(1) >> 4;
  return { level: (nibble & 0x0e) >> 1, charging: (nibble & 0x01) === 1 };
}
