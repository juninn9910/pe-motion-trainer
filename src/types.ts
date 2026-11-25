export type Side = 'L' | 'R';
export type PresetId = 'hooray' | 'reach' | 'bow' | 'ready';
export type BodyMode = 'full' | 'upper';
export type ViewMode = 'overlay' | 'side';
export type ModelVariant = 'lite' | 'full';

export interface Vec2 {
  x: number;
  y: number;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Settings {
  presetId: PresetId;
  bodyMode: BodyMode;
  /** 판정 허용 오차(도). 15 = 정밀, 45 = 관대 */
  toleranceDeg: number;
  /** 목표 유지 시간(초) */
  holdSec: number;
  viewMode: ViewMode;
  /** 진동 세기 0~1 */
  vibration: number;
  /** 스윙 인정 기준 1(살짝) ~ 5(세게) */
  swingLevel: number;
  sound: boolean;
  model: ModelVariant;
  /** '' = 기본 카메라 */
  cameraId: string;
  showDebug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  presetId: 'hooray',
  bodyMode: 'upper',
  toleranceDeg: 30,
  holdSec: 1.0,
  viewMode: 'overlay',
  vibration: 0.7,
  swingLevel: 3,
  sound: true,
  model: 'lite',
  cameraId: '',
  showDebug: false,
};
