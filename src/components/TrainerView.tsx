// 메인 루프: 카메라 프레임 → 자세 인식 → (캘리브레이션 | 판정) → 진동·소리·파티클 → 그리기
// 매 프레임 바뀌는 값은 React state가 아닌 ref에 두고, 화면 표시(HUD)만 바뀔 때 state로 올린다.

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Settings, Side } from '../types';
import { haptics, joycons, sfx } from '../feedback';
import { SwingDetector } from '../joycon/swing';
import { Calibrator, type BodyProfile, type CalibMissing } from '../pose/calibration';
import { evaluate, hapticZones, Session, type Evaluation, type PartStatus, type SessionEvent, type Stage } from '../pose/judge';
import { LM, PART_KEYS, type PartKey, type SegKey } from '../pose/landmarks';
import { PoseDetector } from '../pose/poseDetector';
import { dist2, PoseSmoother, type PoseFrame } from '../pose/poseFrame';
import { PRESETS } from '../pose/presets';
import { PoseSimulator } from '../pose/simulator';
import { buildGuide, drawGuide, drawStudent, type GuideModel } from '../render/drawGuide';
import { PALETTE_HIT, PALETTE_SUCCESS, Particles } from '../render/particles';
import { StudentHud } from './StudentHud';

export type Phase = 'loading' | 'error' | 'calibrating' | 'training';

export interface HudState {
  phase: Phase;
  error: string | null;
  calib: number;
  missing: CalibMissing;
  stars: number;
  progress: number;
  stage: Stage;
  readyLeft: number;
  zoneL: boolean;
  zoneR: boolean;
  noPerson: boolean;
  lastEvent: { type: SessionEvent; at: number } | null;
}

export interface DebugInfo {
  fps: number;
  delegate: string;
  parts: Record<PartKey, PartStatus>;
  segErr: Partial<Record<SegKey, number>>;
  stage: Stage;
}

interface Props {
  settings: Settings;
  stream: MediaStream | null;
  sim: boolean;
  recalKey: number;
  resetKey: number;
  onDebug: (d: DebugInfo) => void;
  onProfile: (p: BodyProfile | null) => void;
}

const OFF_PARTS = Object.fromEntries(PART_KEYS.map((p) => [p, 'off'])) as Record<PartKey, PartStatus>;

const INITIAL_HUD: HudState = {
  phase: 'loading',
  error: null,
  calib: 0,
  missing: 'person',
  stars: 0,
  progress: 0,
  stage: 'pose',
  readyLeft: 0,
  zoneL: false,
  zoneR: false,
  noPerson: false,
  lastEvent: null,
};

function sameHud(a: HudState, b: HudState): boolean {
  return (Object.keys(a) as (keyof HudState)[]).every((key) => a[key] === b[key]);
}

function fit(c: HTMLCanvasElement, w: number, h: number) {
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
}

function TrainerViewImpl({ settings, stream, sim, recalKey, resetKey, onDebug, onProfile }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const sideRef = useRef<HTMLCanvasElement>(null);

  const settingsRef = useRef(settings);
  const onDebugRef = useRef(onDebug);
  const onProfileRef = useRef(onProfile);
  useLayoutEffect(() => {
    settingsRef.current = settings;
    onDebugRef.current = onDebug;
    onProfileRef.current = onProfile;
  });

  const detectorRef = useRef<PoseDetector | null>(null);
  const delegateRef = useRef('—');
  const smootherRef = useRef(new PoseSmoother(0.5));
  const simRef = useRef(new PoseSimulator());
  const calibRef = useRef<Calibrator | null>(null);
  const profileRef = useRef<BodyProfile | null>(null);
  const sessionRef = useRef(new Session());
  const particlesRef = useRef(new Particles());
  const phaseRef = useRef<Phase>('loading');
  const errorRef = useRef<string | null>(null);
  const frameRef = useRef<PoseFrame | null>(null);
  const guideRef = useRef<GuideModel | null>(null);
  const kRef = useRef(0);
  const lastSeenRef = useRef(0);
  const lastEventRef = useRef<HudState['lastEvent']>(null);

  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [swingAt, setSwingAt] = useState(0);

  const startCalibration = useCallback(() => {
    calibRef.current = new Calibrator(settingsRef.current.bodyMode);
    profileRef.current = null;
    onProfileRef.current(null);
    phaseRef.current = 'calibrating';
    sessionRef.current.reset();
    smootherRef.current.reset();
    simRef.current.restart();
    haptics.clearZones();
  }, []);

  const fireEvents = useCallback((events: SessionEvent[]) => {
    const g = guideRef.current;
    const f = frameRef.current;
    const k = kRef.current || 100;
    for (const ev of events) {
      if (ev === 'success') {
        sfx.success();
        haptics.play('both', 'celebrate');
        if (g) particlesRef.current.burst(g.headTop.x, g.headTop.y, k, PALETTE_SUCCESS, 110);
      } else if (ev === 'ready') {
        sfx.ready();
        haptics.play('both', 'ready');
      } else if (ev === 'hit') {
        sfx.hit();
        haptics.play('both', 'impact');
        // 실제 손목 위치에서 터뜨린다(안 보이면 가이드 손 위치)
        const p = f
          ? { x: (f.img[LM.L_WRIST].x + f.img[LM.R_WRIST].x) / 2, y: (f.img[LM.L_WRIST].y + f.img[LM.R_WRIST].y) / 2 }
          : g?.handsMid;
        if (p) particlesRef.current.burst(p.x, p.y, k, PALETTE_HIT, 120);
      }
      if (ev !== 'swingIgnored') lastEventRef.current = { type: ev, at: performance.now() };
    }
  }, []);

  // 자세 인식 모델 불러오기 (모델 종류가 바뀌면 다시)
  useEffect(() => {
    if (sim) {
      startCalibration();
      return;
    }
    let cancelled = false;
    phaseRef.current = 'loading';
    errorRef.current = null;
    PoseDetector.create(settings.model)
      .then((d) => {
        if (cancelled) return d.close();
        detectorRef.current = d;
        delegateRef.current = d.delegate;
        startCalibration();
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        phaseRef.current = 'error';
        errorRef.current =
          '자세 인식 모델을 불러오지 못했습니다. 인터넷 연결을 확인하세요. 학교망에서 막혀 있다면 README의 「모델 파일을 PC에 저장」을 따라 하세요.';
      });
    return () => {
      cancelled = true;
      detectorRef.current?.close();
      detectorRef.current = null;
    };
  }, [settings.model, sim, startCalibration]);

  // 다시 측정 버튼 / 자세 모드 변경 → 재캘리브레이션
  const firstRecal = useRef(true);
  useEffect(() => {
    if (firstRecal.current) {
      firstRecal.current = false;
      return;
    }
    if (phaseRef.current === 'calibrating' || phaseRef.current === 'training') startCalibration();
  }, [recalKey, settings.bodyMode, startCalibration]);

  useEffect(() => {
    if (resetKey) sessionRef.current.stars = 0;
  }, [resetKey]);

  useEffect(() => {
    sessionRef.current.reset();
    haptics.clearZones();
  }, [settings.presetId]);

  // 카메라 연결
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    v.srcObject = stream;
    v.play().catch(() => {});
    return () => {
      v.srcObject = null;
    };
  }, [stream]);

  // 스윙 입력: 조이콘 IMU + 키보드 스페이스바(폴백)
  useEffect(() => {
    const handleSwing = () => {
      setSwingAt(performance.now());
      if (phaseRef.current !== 'training' || !PRESETS[settingsRef.current.presetId].combo) return;
      fireEvents(sessionRef.current.swing(performance.now()));
    };
    const detector = new SwingDetector(() => settingsRef.current.swingLevel, handleSwing);
    const offImu = joycons.onImu((r) => detector.feed(r));
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text'))) return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      handleSwing();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offImu();
      window.removeEventListener('keydown', onKey);
    };
  }, [fireEvents]);

  // 메인 루프
  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    let lastVideoTime = -1;
    let detCount = 0;
    let fpsT = lastT;
    let fps = 0;
    let lastDebug = 0;
    let lastHud: HudState | null = null;
    let warned = false;
    const zoneOn: Record<Side, boolean> = { L: false, R: false };
    const zoneLastTrue: Record<Side, number> = { L: 0, R: 0 };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const s = settingsRef.current;
      const preset = PRESETS[s.presetId];
      const video = videoRef.current;
      let w = 1280;
      let h = 720;

      // 1) 자세 얻기
      if (sim) {
        if (phaseRef.current === 'calibrating' || phaseRef.current === 'training') {
          frameRef.current = simRef.current.frame(now, preset, w, h);
          lastSeenRef.current = now;
          detCount++;
        }
      } else if (video && video.videoWidth > 0) {
        w = video.videoWidth;
        h = video.videoHeight;
        const det = detectorRef.current;
        if (det && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          try {
            frameRef.current = smootherRef.current.update(det.detect(video, now), w, h);
            if (frameRef.current) lastSeenRef.current = now;
            detCount++;
          } catch (err) {
            if (!warned) console.warn('[detect]', err);
            warned = true;
          }
        }
      }
      const frame = frameRef.current;
      if (frame) {
        const m = dist2(frame.img[LM.L_SHOULDER], frame.img[LM.R_SHOULDER]);
        if (m > 5) kRef.current = kRef.current ? kRef.current * 0.85 + m * 0.15 : m;
      }
      const k = kRef.current || w * 0.12;
      const session = sessionRef.current;

      // 2) 캘리브레이션 또는 판정
      let ev: Evaluation | null = null;
      if (phaseRef.current === 'calibrating' && calibRef.current) {
        calibRef.current.add(frame, now);
        if (calibRef.current.done) {
          const prof = calibRef.current.result();
          profileRef.current = prof;
          onProfileRef.current(prof);
          phaseRef.current = 'training';
          sfx.calibrated();
          haptics.play('both', 'tick');
        }
      } else if (phaseRef.current === 'training' && profileRef.current) {
        if (frame && now - lastSeenRef.current < 500) {
          ev = evaluate(frame, profileRef.current, preset, s.bodyMode, s.toleranceDeg);
        }
        const events = session.update(ev, now, s.holdSec * 1000, !!preset.combo);
        if (events.length) fireEvents(events);
      }

      // 3) 좌/우 진동 구역 (꺼질 때만 200ms 여유 → 경계에서 떨림 방지)
      const z = ev && session.stage === 'pose' ? hapticZones(ev) : { L: false, R: false };
      for (const side of ['L', 'R'] as Side[]) {
        if (z[side]) {
          zoneLastTrue[side] = now;
          if (!zoneOn[side]) {
            zoneOn[side] = true;
            haptics.setZone(side, true);
            sfx.tick();
          }
        } else if (zoneOn[side] && now - zoneLastTrue[side] > 200) {
          zoneOn[side] = false;
          haptics.setZone(side, false);
        }
      }

      // 4) 그리기 (캔버스는 CSS로 좌우 반전 = 거울 모드. 여기서는 원본 영상 좌표로 그린다)
      const statuses = ev?.parts ?? OFF_PARTS;
      const main = mainRef.current;
      if (main) {
        fit(main, w, h);
        const ctx = main.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          let gctx = ctx;
          const sideCanvas = sideRef.current;
          if (s.viewMode === 'side' && sideCanvas) {
            fit(sideCanvas, w, h);
            gctx = sideCanvas.getContext('2d') ?? ctx;
            gctx.clearRect(0, 0, w, h);
          }
          if (phaseRef.current === 'training' && frame && profileRef.current) {
            const g = buildGuide(frame, profileRef.current, preset, s.bodyMode, k);
            guideRef.current = g;
            drawGuide(gctx, g, statuses, session.stage, !!preset.combo, k, now);
          }
          if (frame) drawStudent(ctx, frame, s.bodyMode, k, statuses);
          particlesRef.current.update(dt, k * 14);
          particlesRef.current.draw(ctx);
        }
      }

      // 5) HUD·디버그
      if (now - fpsT >= 1000) {
        fps = Math.round((detCount * 1000) / (now - fpsT));
        detCount = 0;
        fpsT = now;
      }
      const next: HudState = {
        phase: phaseRef.current,
        error: errorRef.current,
        calib: Math.round((calibRef.current?.progress ?? 0) * 40) / 40,
        missing: phaseRef.current !== 'calibrating' ? null : calibRef.current ? calibRef.current.missing : 'person',
        stars: session.stars,
        progress: Math.round(session.progress * 40) / 40,
        stage: session.stage,
        readyLeft: Math.round(session.readyLeft * 40) / 40,
        zoneL: zoneOn.L,
        zoneR: zoneOn.R,
        noPerson: !sim && phaseRef.current === 'training' && now - lastSeenRef.current > 1000,
        lastEvent: lastEventRef.current,
      };
      if (!lastHud || !sameHud(lastHud, next)) {
        lastHud = next;
        setHud(next);
      }
      if (now - lastDebug > 250) {
        lastDebug = now;
        onDebugRef.current({
          fps,
          delegate: sim ? '시뮬레이션' : delegateRef.current,
          parts: statuses,
          segErr: ev?.segErr ?? {},
          stage: session.stage,
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      haptics.stopAll();
    };
  }, [sim, fireEvents]);

  const side = settings.viewMode === 'side';
  const mirror = { transform: 'scaleX(-1)' } as const;
  const preset = PRESETS[settings.presetId];

  return (
    <div className="absolute inset-0 flex bg-neutral-950">
      <div className={`relative h-full ${side ? 'w-1/2' : 'w-full'}`}>
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ ...mirror, display: sim ? 'none' : undefined }}
          muted
          playsInline
        />
        <canvas ref={mainRef} className="absolute inset-0 h-full w-full object-contain" style={mirror} />
      </div>
      {side && (
        <div className="relative h-full w-1/2 border-l-4 border-neutral-700 bg-neutral-900">
          <canvas ref={sideRef} className="absolute inset-0 h-full w-full object-contain" style={mirror} />
        </div>
      )}
      <StudentHud hud={hud} preset={preset} bodyMode={settings.bodyMode} swingAt={swingAt} />
    </div>
  );
}

export const TrainerView = memo(TrainerViewImpl);
