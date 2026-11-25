// 교사 제어 패널 (오른쪽에서 열리는 서랍). 설정은 이 브라우저에 자동 저장된다.

import type { ReactNode } from 'react';
import type { Settings } from '../types';
import type { BodyProfile } from '../pose/calibration';
import { PART_KEYS, PART_LABEL, SEG_KEYS, type SegKey } from '../pose/landmarks';
import { PRESET_ORDER, PRESETS } from '../pose/presets';
import { JoyConConnect } from './JoyConConnect';
import type { DebugInfo } from './TrainerView';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  profile: BodyProfile | null;
  debug: DebugInfo | null;
  cameras: MediaDeviceInfo[];
  sim: boolean;
  onRecalibrate: () => void;
  onResetStars: () => void;
  onOpenDiagnostics: () => void;
}

const SEG_LABEL: Record<SegKey, string> = {
  lUpper: '왼 윗팔',
  lFore: '왼 아랫팔',
  rUpper: '오른 윗팔',
  rFore: '오른 아랫팔',
  torso: '몸통',
  lThigh: '왼 허벅지',
  lShin: '왼 정강이',
  rThigh: '오른 허벅지',
  rShin: '오른 정강이',
};

const STATUS_LABEL = { match: '✅ 일치', miss: '❌', unknown: '❔ 안 보임', off: '—' } as const;

export function TeacherPanel(p: Props) {
  const s = p.settings;
  const preset = PRESETS[s.presetId];

  return (
    <aside
      className={`fixed right-0 top-0 z-30 flex h-full w-[380px] max-w-[92vw] flex-col bg-neutral-900/95 text-neutral-100 shadow-2xl ring-1 ring-white/10 backdrop-blur transition-transform duration-200 ${
        p.open ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-hidden={!p.open}
    >
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <h2 className="text-lg font-bold">교사 설정</h2>
        <button className="rounded-lg px-3 py-1 text-2xl hover:bg-white/10" onClick={p.onClose} aria-label="닫기">
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
        <Section title="조이콘">
          <JoyConConnect size="sm" />
        </Section>

        <Section title="동작">
          <div className="grid grid-cols-2 gap-2">
            {PRESET_ORDER.map((id) => (
              <button
                key={id}
                onClick={() => p.update({ presetId: id })}
                className={`rounded-xl px-2 py-3 text-center ring-2 transition ${
                  s.presetId === id ? 'bg-emerald-500/25 ring-emerald-400' : 'bg-white/5 ring-transparent hover:bg-white/10'
                }`}
              >
                <div className="text-3xl">{PRESETS[id].emoji}</div>
                <div className="mt-1 text-sm font-semibold">{PRESETS[id].name}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-neutral-400">{preset.hint}</p>
        </Section>

        <Section title="자세 모드">
          <Segmented
            value={s.bodyMode}
            onChange={(v) => p.update({ bodyMode: v })}
            options={[
              ['full', '🧍 전신'],
              ['upper', '🧑‍🦽 상체(좌식·휠체어)'],
            ]}
          />
          <p className="mt-2 text-xs text-neutral-400">
            {s.bodyMode === 'upper' ? '다리는 판정·가이드에서 빠집니다.' : '발끝까지 화면에 보여야 합니다.'} 바꾸면 신체 측정을 다시 합니다.
          </p>
        </Section>

        <Section title={`허용 오차 ${s.toleranceDeg}°`}>
          <Slider min={15} max={45} step={1} value={s.toleranceDeg} onChange={(v) => p.update({ toleranceDeg: v })} left="정밀" right="관대" />
        </Section>

        <Section title={`유지 시간 ${s.holdSec.toFixed(1)}초`}>
          <Slider min={0.5} max={3} step={0.1} value={s.holdSec} onChange={(v) => p.update({ holdSec: Math.round(v * 10) / 10 })} left="0.5초" right="3초" />
        </Section>

        <Section title={`진동 세기 ${Math.round(s.vibration * 100)}%`}>
          <Slider min={0} max={1} step={0.05} value={s.vibration} onChange={(v) => p.update({ vibration: v })} left="끔" right="강하게" />
          <p className="mt-1 text-xs text-neutral-400">감각이 예민한 학생은 낮춰 주세요.</p>
        </Section>

        {preset.combo && (
          <Section title={`스윙 기준 ${s.swingLevel}단계`}>
            <Slider min={1} max={5} step={1} value={s.swingLevel} onChange={(v) => p.update({ swingLevel: v })} left="살짝" right="세게" />
            <p className="mt-1 text-xs text-neutral-400">조이콘이 없으면 스페이스바가 스윙입니다.</p>
          </Section>
        )}

        <Section title="보기">
          <Segmented
            value={s.viewMode}
            onChange={(v) => p.update({ viewMode: v })}
            options={[
              ['overlay', '겹치기'],
              ['side', '나란히'],
            ]}
          />
        </Section>

        <Section title="소리·인식">
          <div className="flex flex-col gap-3">
            <Segmented
              value={s.sound ? 'on' : 'off'}
              onChange={(v) => p.update({ sound: v === 'on' })}
              options={[
                ['on', '🔊 소리 켬'],
                ['off', '🔇 끔'],
              ]}
            />
            <Segmented
              value={s.model}
              onChange={(v) => p.update({ model: v })}
              options={[
                ['lite', '⚡ 빠른 인식'],
                ['full', '🎯 정확한 인식'],
              ]}
            />
            {!p.sim && p.cameras.length > 1 && (
              <select
                className="rounded-lg bg-white/10 px-3 py-2 text-sm"
                value={s.cameraId}
                onChange={(e) => p.update({ cameraId: e.target.value })}
              >
                <option value="">기본 카메라</option>
                {p.cameras.map((c, i) => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label || `카메라 ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </Section>

        <Section title="도구">
          <div className="grid grid-cols-2 gap-2">
            <ToolButton onClick={p.onRecalibrate}>🔄 신체 다시 측정</ToolButton>
            <ToolButton onClick={p.onResetStars}>⭐ 횟수 초기화</ToolButton>
            <ToolButton onClick={p.onOpenDiagnostics}>🎮 조이콘 진단</ToolButton>
            <ToolButton
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen().catch(() => {});
              }}
            >
              ⛶ 전체 화면
            </ToolButton>
          </div>
        </Section>

        <Section title="측정된 신체 비율">
          {p.profile ? (
            <table className="w-full text-sm">
              <tbody className="[&_td]:py-0.5">
                <Row k="어깨너비" v={p.profile.shoulderCm ? `약 ${Math.round(p.profile.shoulderCm)}cm (추정)` : '—'} />
                <Row k="윗팔 (왼/오)" v={`${p.profile.ratios.upperL.toFixed(2)} / ${p.profile.ratios.upperR.toFixed(2)}`} />
                <Row k="아랫팔 (왼/오)" v={`${p.profile.ratios.foreL.toFixed(2)} / ${p.profile.ratios.foreR.toFixed(2)}`} />
                <Row k="상체" v={p.profile.ratios.torso.toFixed(2)} />
                {p.profile.mode === 'full' && (
                  <>
                    <Row k="허벅지 (왼/오)" v={`${p.profile.ratios.thighL.toFixed(2)} / ${p.profile.ratios.thighR.toFixed(2)}`} />
                    <Row k="정강이 (왼/오)" v={`${p.profile.ratios.shinL.toFixed(2)} / ${p.profile.ratios.shinR.toFixed(2)}`} />
                  </>
                )}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-neutral-400">측정 중…</p>
          )}
          <p className="mt-1 text-xs text-neutral-500">어깨너비를 1로 둔 비율입니다.</p>
        </Section>

        <Section title="판정 상세">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.showDebug} onChange={(e) => p.update({ showDebug: e.target.checked })} />
            보기
          </label>
          {s.showDebug && p.debug && (
            <div className="mt-2 space-y-2 text-sm">
              <div className="text-neutral-400">
                인식 {p.debug.fps}fps · {p.debug.delegate} · 단계 {p.debug.stage}
              </div>
              <table className="w-full">
                <tbody className="[&_td]:py-0.5">
                  {PART_KEYS.filter((k) => p.debug!.parts[k] !== 'off').map((k) => (
                    <Row key={k} k={PART_LABEL[k]} v={STATUS_LABEL[p.debug!.parts[k]]} />
                  ))}
                </tbody>
              </table>
              <table className="w-full font-mono text-xs">
                <tbody className="[&_td]:py-0.5">
                  {SEG_KEYS.filter((k) => p.debug!.segErr[k] !== undefined).map((k) => {
                    const e = p.debug!.segErr[k]!;
                    return <Row key={k} k={SEG_LABEL[k]} v={<span className={e <= s.toleranceDeg ? 'text-emerald-400' : 'text-rose-400'}>{e.toFixed(0)}°</span>} />;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-400">{title}</h3>
      {children}
    </section>
  );
}

function Slider(props: { min: number; max: number; step: number; value: number; onChange: (v: number) => void; left: string; right: string }) {
  return (
    <div>
      <input
        type="range"
        className="big-range w-full"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <div className="flex justify-between text-xs text-neutral-400">
        <span>{props.left}</span>
        <span>{props.right}</span>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex rounded-xl bg-white/5 p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold transition ${value === v ? 'bg-sky-500 text-white' : 'text-neutral-300 hover:bg-white/10'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ToolButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold hover:bg-white/20">
      {children}
    </button>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <tr>
      <td className="text-neutral-400">{k}</td>
      <td className="text-right">{v}</td>
    </tr>
  );
}
