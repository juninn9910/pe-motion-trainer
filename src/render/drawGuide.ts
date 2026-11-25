// 학생 신체 비율에 맞춘 목표 실루엣(가이드) 생성·그리기 + 학생 본인 뼈대 그리기.
//
// ■ 가이드 순기구학 (영상 픽셀 좌표)
//   k = 현재 프레임의 어깨너비(px, 평활) — 학생이 앞뒤로 움직여도 가이드 크기가 따라감
//   자식관절 = 부모관절 + projectDir(목표방향) × (캘리브레이션 비율 × k)
//   projectDir 는 앞쪽 성분을 버리는 정사영이라, 앞으로 뻗는 팔은 짧게(원근 단축) 그려진다.
//   대신 '앞으로 나온 정도(깊이)'만큼 굵기를 키워 가까워지는 느낌을 준다.
//
//   팔 기준점: anchor=shoulders → 학생의 실제 어깨 / anchor=hips → 엉덩이에서 세운 목표 어깨
//   다리 기준점: 학생의 실제 엉덩이 관절

import type { BodyMode, Vec2 } from '../types';
import type { BodyProfile } from '../pose/calibration';
import type { PartStatus, Stage } from '../pose/judge';
import { dirFromSpec, lateralSign2D, projectDir, type Sign } from '../pose/kinematics';
import { LANDMARK_PART, LM, LOWER_EDGES, UPPER_EDGES, type PartKey, type SegKey } from '../pose/landmarks';
import { jointImg, jointVis, type PoseFrame } from '../pose/poseFrame';
import type { PresetDef } from '../pose/presets';

export interface GuideBone {
  part: PartKey;
  a: Vec2;
  b: Vec2;
  ra: number;
  rb: number;
}

export interface GuideModel {
  bones: GuideBone[];
  head: { c: Vec2; r: number };
  /** 손·발 끝 목표점. fwd 가 크면 '앞으로 뻗기' 표시(퍼지는 링) */
  ends: { p: Vec2; r: number; part: PartKey; fwd: number }[];
  /** 파티클 원점 */
  headTop: Vec2;
  handsMid: Vec2;
}

/** 굵기(반지름) — 어깨너비 = 1 기준 */
const RAD = { torsoHip: 0.36, torsoSh: 0.44, upper: 0.14, fore: 0.115, thigh: 0.17, shin: 0.135, head: 0.33 };

const depthScale = (d: number) => Math.max(0.75, Math.min(1.9, 1 + 0.5 * d));
const along = (p: Vec2, d: Vec2, len: number): Vec2 => ({ x: p.x + d.x * len, y: p.y + d.y * len });

export function buildGuide(frame: PoseFrame, profile: BodyProfile, preset: PresetDef, mode: BodyMode, k: number): GuideModel {
  const lat: Sign = lateralSign2D(frame);
  const R = profile.ratios;
  const dir = (s: SegKey) => dirFromSpec(preset.targets[s]);
  const bones: GuideBone[] = [];
  const ends: GuideModel['ends'] = [];

  const shActual = jointImg(frame, 'shoulderMid');
  // 엉덩이가 완전히 가려졌으면(휠체어·책상) 어깨 아래로 몸통 길이만큼 내려 가상 엉덩이를 둔다
  const hipMid = jointVis(frame, 'hipMid') >= 0.1 ? jointImg(frame, 'hipMid') : { x: shActual.x, y: shActual.y + R.torso * k };

  const torsoD = dir('torso');
  let shMid: Vec2;
  let shDepth = 0;
  if (preset.anchor === 'hips') {
    shMid = along(hipMid, projectDir(torsoD, 'C', lat), R.torso * k);
    shDepth = torsoD.f * R.torso;
  } else {
    shMid = shActual;
  }
  bones.push({ part: 'torso', a: hipMid, b: shMid, ra: RAD.torsoHip * k, rb: RAD.torsoSh * k * depthScale(shDepth) });

  const headC = along(shMid, projectDir(torsoD, 'C', lat), R.head * k);
  const head = { c: headC, r: RAD.head * k * depthScale(shDepth + torsoD.f * R.head) };

  let lSh: Vec2;
  let rSh: Vec2;
  if (preset.anchor === 'hips') {
    lSh = along(shMid, { x: lat, y: 0 }, k / 2);
    rSh = along(shMid, { x: -lat, y: 0 }, k / 2);
  } else {
    lSh = frame.img[LM.L_SHOULDER];
    rSh = frame.img[LM.R_SHOULDER];
  }

  const limb = (
    side: 'L' | 'R',
    root: Vec2,
    rootDepth: number,
    s1: SegKey,
    s2: SegKey,
    len1: number,
    len2: number,
    rad1: number,
    rad2: number,
    part: PartKey,
  ) => {
    const d1 = dir(s1);
    const d2 = dir(s2);
    const mid = along(root, projectDir(d1, side, lat), len1 * k);
    const midDepth = rootDepth + d1.f * len1;
    const end = along(mid, projectDir(d2, side, lat), len2 * k);
    const endDepth = midDepth + d2.f * len2;
    bones.push({ part, a: root, b: mid, ra: rad1 * k * depthScale(rootDepth), rb: rad1 * 0.9 * k * depthScale(midDepth) });
    bones.push({ part, a: mid, b: end, ra: rad2 * k * depthScale(midDepth), rb: rad2 * 0.85 * k * depthScale(endDepth) });
    ends.push({ p: end, r: rad2 * 1.35 * k * depthScale(endDepth), part, fwd: Math.max(0, d2.f) });
    return end;
  };

  if (mode === 'full') {
    limb('L', frame.img[LM.L_HIP], 0, 'lThigh', 'lShin', R.thighL, R.shinL, RAD.thigh, RAD.shin, 'leftLeg');
    limb('R', frame.img[LM.R_HIP], 0, 'rThigh', 'rShin', R.thighR, R.shinR, RAD.thigh, RAD.shin, 'rightLeg');
  }
  const lw = limb('L', lSh, shDepth, 'lUpper', 'lFore', R.upperL, R.foreL, RAD.upper, RAD.fore, 'leftArm');
  const rw = limb('R', rSh, shDepth, 'rUpper', 'rFore', R.upperR, R.foreR, RAD.upper, RAD.fore, 'rightArm');

  return {
    bones,
    head,
    ends,
    headTop: { x: headC.x, y: headC.y - head.r },
    handsMid: { x: (lw.x + rw.x) / 2, y: (lw.y + rw.y) / 2 },
  };
}

// ───────────────────────── 그리기 ─────────────────────────

interface Style {
  fill: string;
  stroke: string;
  glow: string | null;
  dashed: boolean;
}

const STYLE = {
  idle: { fill: 'rgba(255,255,255,0.30)', stroke: 'rgba(120,200,255,0.95)', glow: null, dashed: false },
  unknown: { fill: 'rgba(255,255,255,0.22)', stroke: 'rgba(120,200,255,0.8)', glow: null, dashed: true },
  match: { fill: 'rgba(57,255,20,0.45)', stroke: '#39ff14', glow: '#39ff14', dashed: false },
  gold: { fill: 'rgba(255,212,0,0.48)', stroke: '#ffd400', glow: '#ffd400', dashed: false },
  off: { fill: 'rgba(255,255,255,0.12)', stroke: 'rgba(255,255,255,0.35)', glow: null, dashed: false },
} satisfies Record<string, Style>;

function styleFor(status: PartStatus, stage: Stage, combo: boolean): Style {
  if (status === 'off') return STYLE.off;
  if (stage === 'ready' || (stage === 'cooldown' && combo)) return STYLE.gold;
  if (stage === 'cooldown' || status === 'match') return STYLE.match;
  if (status === 'unknown') return STYLE.unknown;
  return STYLE.idle;
}

/** 굵기가 변하는 캡슐 외곽선 (모든 캡슐이 같은 회전 방향 → 한 path로 합쳐 칠해도 겹친 곳이 진해지지 않음) */
function capsule(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, ra: number, rb: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1) {
    ctx.moveTo(b.x + Math.max(ra, rb), b.y);
    ctx.arc(b.x, b.y, Math.max(ra, rb), 0, Math.PI * 2);
    return;
  }
  const ang = Math.atan2(dy, dx);
  ctx.moveTo(a.x + Math.cos(ang + Math.PI / 2) * ra, a.y + Math.sin(ang + Math.PI / 2) * ra);
  ctx.arc(a.x, a.y, ra, ang + Math.PI / 2, ang - Math.PI / 2);
  ctx.arc(b.x, b.y, rb, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
}

const DRAW_ORDER: PartKey[] = ['torso', 'leftLeg', 'rightLeg', 'leftArm', 'rightArm'];

export function drawGuide(
  ctx: CanvasRenderingContext2D,
  g: GuideModel,
  statuses: Record<PartKey, PartStatus>,
  stage: Stage,
  combo: boolean,
  k: number,
  t: number,
) {
  ctx.save();
  ctx.lineJoin = 'round';
  for (const part of DRAW_ORDER) {
    const bones = g.bones.filter((b) => b.part === part);
    if (!bones.length) continue;
    const st = styleFor(statuses[part], stage, combo);

    ctx.beginPath();
    for (const b of bones) capsule(ctx, b.a, b.b, b.ra, b.rb);
    if (part === 'torso') {
      ctx.moveTo(g.head.c.x + g.head.r, g.head.c.y);
      ctx.arc(g.head.c.x, g.head.c.y, g.head.r, 0, Math.PI * 2);
    }

    ctx.setLineDash([]);
    ctx.lineWidth = Math.max(5, k * 0.035) + 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.stroke();

    if (st.glow) {
      ctx.shadowColor = st.glow;
      ctx.shadowBlur = k * 0.35;
    }
    ctx.fillStyle = st.fill;
    ctx.fill('nonzero');
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    ctx.setLineDash(st.dashed ? [k * 0.08, k * 0.06] : []);
    ctx.lineWidth = Math.max(5, k * 0.035);
    ctx.strokeStyle = st.stroke;
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 손·발 끝 목표점
  for (const e of g.ends) {
    const status = statuses[e.part];
    if (status === 'off') continue;
    const st = styleFor(status, stage, combo);
    ctx.beginPath();
    ctx.arc(e.p.x, e.p.y, e.r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(4, k * 0.03);
    ctx.strokeStyle = st.stroke;
    ctx.stroke();
    // 앞으로 뻗는 동작: 링이 바깥으로 퍼지며 '화면 쪽으로' 를 표시
    if (e.fwd > 0.6 && status !== 'match' && stage === 'pose') {
      for (let i = 0; i < 2; i++) {
        const ph = ((t / 1000 + i * 0.5) % 1 + 1) % 1;
        ctx.globalAlpha = (1 - ph) * 0.9;
        ctx.beginPath();
        ctx.arc(e.p.x, e.p.y, e.r * (1 + ph * 1.6), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

export function drawStudent(
  ctx: CanvasRenderingContext2D,
  f: PoseFrame,
  mode: BodyMode,
  k: number,
  statuses: Record<PartKey, PartStatus>,
) {
  const edges = mode === 'full' ? [...UPPER_EDGES, ...LOWER_EDGES] : UPPER_EDGES;
  const ok = (i: number) => f.vis[i] >= 0.5;
  const lw = Math.max(3, k * 0.04);
  ctx.save();
  ctx.lineCap = 'round';
  for (const [color, width] of [
    ['rgba(0,0,0,0.6)', lw + 4],
    ['rgba(255,255,255,0.92)', lw],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [a, b] of edges) {
      if (!ok(a) || !ok(b)) continue;
      ctx.moveTo(f.img[a].x, f.img[a].y);
      ctx.lineTo(f.img[b].x, f.img[b].y);
    }
    ctx.stroke();
  }
  const joints = new Set(edges.flat());
  for (const j of joints) {
    if (!ok(j)) continue;
    const part = LANDMARK_PART[j];
    const matched = part ? statuses[part] === 'match' : false;
    const isEnd = j === LM.L_WRIST || j === LM.R_WRIST || j === LM.L_ANKLE || j === LM.R_ANKLE;
    const r = Math.max(4, k * (isEnd ? 0.075 : 0.05));
    ctx.beginPath();
    ctx.arc(f.img[j].x, f.img[j].y, r, 0, Math.PI * 2);
    ctx.fillStyle = matched ? '#39ff14' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.stroke();
  }
  ctx.restore();
}
