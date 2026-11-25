// MediaPipe Pose 33 랜드마크 중 이 앱이 쓰는 것들과, 뼈(segment)·부위(part) 정의.

export const LM = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const;

/** 실제 랜드마크 번호 또는 두 점의 중점(가상 관절) */
export type JointRef = number | 'hipMid' | 'shoulderMid';

export type SegKey =
  | 'lUpper'
  | 'lFore'
  | 'rUpper'
  | 'rFore'
  | 'torso'
  | 'lThigh'
  | 'lShin'
  | 'rThigh'
  | 'rShin';

export type PartKey = 'leftArm' | 'rightArm' | 'torso' | 'leftLeg' | 'rightLeg';

/** L/R = 학생 기준 왼쪽/오른쪽, C = 몸통(중앙) */
export type SegSide = 'L' | 'R' | 'C';

export interface SegmentDef {
  from: JointRef;
  to: JointRef;
  side: SegSide;
  part: PartKey;
}

export const SEGMENTS: Record<SegKey, SegmentDef> = {
  lUpper: { from: LM.L_SHOULDER, to: LM.L_ELBOW, side: 'L', part: 'leftArm' },
  lFore: { from: LM.L_ELBOW, to: LM.L_WRIST, side: 'L', part: 'leftArm' },
  rUpper: { from: LM.R_SHOULDER, to: LM.R_ELBOW, side: 'R', part: 'rightArm' },
  rFore: { from: LM.R_ELBOW, to: LM.R_WRIST, side: 'R', part: 'rightArm' },
  torso: { from: 'hipMid', to: 'shoulderMid', side: 'C', part: 'torso' },
  lThigh: { from: LM.L_HIP, to: LM.L_KNEE, side: 'L', part: 'leftLeg' },
  lShin: { from: LM.L_KNEE, to: LM.L_ANKLE, side: 'L', part: 'leftLeg' },
  rThigh: { from: LM.R_HIP, to: LM.R_KNEE, side: 'R', part: 'rightLeg' },
  rShin: { from: LM.R_KNEE, to: LM.R_ANKLE, side: 'R', part: 'rightLeg' },
};

export const SEG_KEYS = Object.keys(SEGMENTS) as SegKey[];

export const PART_SEGMENTS: Record<PartKey, SegKey[]> = {
  leftArm: ['lUpper', 'lFore'],
  rightArm: ['rUpper', 'rFore'],
  torso: ['torso'],
  leftLeg: ['lThigh', 'lShin'],
  rightLeg: ['rThigh', 'rShin'],
};

export const PART_KEYS = Object.keys(PART_SEGMENTS) as PartKey[];
export const LOWER_PARTS: PartKey[] = ['leftLeg', 'rightLeg'];

export const PART_LABEL: Record<PartKey, string> = {
  leftArm: '왼팔',
  rightArm: '오른팔',
  torso: '몸통',
  leftLeg: '왼다리',
  rightLeg: '오른다리',
};

/** 학생 본인 뼈대(얇은 선) 그리기용 연결 */
export const UPPER_EDGES: [number, number][] = [
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_ELBOW],
  [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW],
  [LM.R_ELBOW, LM.R_WRIST],
  [LM.L_SHOULDER, LM.L_HIP],
  [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP, LM.R_HIP],
];
export const LOWER_EDGES: [number, number][] = [
  [LM.L_HIP, LM.L_KNEE],
  [LM.L_KNEE, LM.L_ANKLE],
  [LM.R_HIP, LM.R_KNEE],
  [LM.R_KNEE, LM.R_ANKLE],
];

/** 랜드마크 번호 → 소속 부위(학생 뼈대 색칠용) */
export const LANDMARK_PART: Partial<Record<number, PartKey>> = {
  [LM.L_ELBOW]: 'leftArm',
  [LM.L_WRIST]: 'leftArm',
  [LM.R_ELBOW]: 'rightArm',
  [LM.R_WRIST]: 'rightArm',
  [LM.L_KNEE]: 'leftLeg',
  [LM.L_ANKLE]: 'leftLeg',
  [LM.R_KNEE]: 'rightLeg',
  [LM.R_ANKLE]: 'rightLeg',
};
