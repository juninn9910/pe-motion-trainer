// 목표 동작 프리셋. 모든 동작은 픽셀 좌표가 아닌 '관절 각도'로만 정의한다.
// 각도 의미는 kinematics.ts 상단 주석 참고 (raise: 아래=0·옆=90·위=180, fwd: 앞으로 기운 각).

import type { PresetId } from '../types';
import type { DirSpec } from './kinematics';
import type { PartKey, SegKey } from './landmarks';

export interface PresetDef {
  id: PresetId;
  name: string;
  emoji: string;
  /** 교사용 짧은 설명 */
  hint: string;
  /** 가이드 그리기용 전체 뼈대 목표 각도 */
  targets: Record<SegKey, DirSpec>;
  /** 판정에 쓰는 부위 (상체 모드에서는 다리가 자동 제외됨) */
  judged: PartKey[];
  /**
   * 팔 가이드를 어디에 붙일지.
   * shoulders = 학생의 실제 어깨에 붙임(몸통은 판정 안 함)
   * hips      = 엉덩이에서 목표 몸통 각도로 세운 '목표 어깨'에 붙임(몸통이 판정 대상일 때)
   */
  anchor: 'shoulders' | 'hips';
  /** 2단계 콤보(자세 → 스윙) */
  combo?: boolean;
}

const STRAIGHT_LEGS = {
  lThigh: { raise: 4, fwd: 0 },
  lShin: { raise: 2, fwd: 0 },
  rThigh: { raise: 4, fwd: 0 },
  rShin: { raise: 2, fwd: 0 },
} satisfies Partial<Record<SegKey, DirSpec>>;

const HANGING_ARMS = {
  lUpper: { raise: 8, fwd: 0 },
  lFore: { raise: 5, fwd: 5 },
  rUpper: { raise: 8, fwd: 0 },
  rFore: { raise: 5, fwd: 5 },
} satisfies Partial<Record<SegKey, DirSpec>>;

/** 캘리브레이션·시뮬레이터용 차렷 자세 */
export const NEUTRAL_TARGETS: Record<SegKey, DirSpec> = {
  ...HANGING_ARMS,
  torso: { raise: 180, fwd: 0 },
  ...STRAIGHT_LEGS,
};

export const PRESETS: Record<PresetId, PresetDef> = {
  hooray: {
    id: 'hooray',
    name: '양손 만세',
    emoji: '🙌',
    hint: '두 팔을 머리 위로 쭉 뻗기',
    targets: {
      lUpper: { raise: 160, fwd: 0 },
      lFore: { raise: 165, fwd: 0 },
      rUpper: { raise: 160, fwd: 0 },
      rFore: { raise: 165, fwd: 0 },
      torso: { raise: 180, fwd: 0 },
      ...STRAIGHT_LEGS,
    },
    judged: ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
    anchor: 'shoulders',
  },
  reach: {
    id: 'reach',
    name: '앞으로 나란히',
    emoji: '🤲',
    hint: '두 팔을 어깨 높이로 앞(화면 쪽)으로 뻗기',
    targets: {
      lUpper: { raise: 0, fwd: 90 },
      lFore: { raise: 0, fwd: 90 },
      rUpper: { raise: 0, fwd: 90 },
      rFore: { raise: 0, fwd: 90 },
      torso: { raise: 180, fwd: 0 },
      ...STRAIGHT_LEGS,
    },
    judged: ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
    anchor: 'shoulders',
  },
  bow: {
    id: 'bow',
    name: '몸 수그리기',
    emoji: '🙇',
    hint: '상체를 앞으로 40° 숙이기 (팔은 판정 안 함)',
    targets: {
      ...HANGING_ARMS,
      torso: { raise: 180, fwd: 40 },
      ...STRAIGHT_LEGS,
    },
    judged: ['torso', 'leftLeg', 'rightLeg'],
    anchor: 'hips',
  },
  ready: {
    id: 'ready',
    name: '라켓·티볼 대기 + 스윙',
    emoji: '🏏',
    hint: '①배 앞에서 두 손 모으고 무릎 살짝 굽히기 → ②조이콘(라켓) 휘두르기',
    targets: {
      lUpper: { raise: 15, fwd: 30 },
      lFore: { raise: -100, fwd: 50 },
      rUpper: { raise: 15, fwd: 30 },
      rFore: { raise: -100, fwd: 50 },
      torso: { raise: 180, fwd: 15 },
      lThigh: { raise: 8, fwd: 25 },
      lShin: { raise: 0, fwd: -10 },
      rThigh: { raise: 8, fwd: 25 },
      rShin: { raise: 0, fwd: -10 },
    },
    judged: ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
    anchor: 'shoulders',
    combo: true,
  },
};

export const PRESET_ORDER: PresetId[] = ['hooray', 'reach', 'bow', 'ready'];
