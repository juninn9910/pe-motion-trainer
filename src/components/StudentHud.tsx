// 학생용 화면 표시: 글자를 최소화하고 큰 아이콘·색·링으로만 알려 준다.

import { useEffect, useState, type ReactNode } from 'react';
import type { BodyMode, Side } from '../types';
import { haptics } from '../feedback';
import type { PresetDef } from '../pose/presets';
import type { HudState } from './TrainerView';

function Ring({ value, size, color, track = 'rgba(255,255,255,0.18)', children }: { value: number; size: number; color: string; track?: string; children?: ReactNode }) {
  const sw = size * 0.09;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(0,0,0,0.45)" stroke={track} strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          style={{ transition: 'stroke-dashoffset 80ms linear', filter: value > 0 ? `drop-shadow(0 0 8px ${color})` : undefined }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: size * 0.42 }}>
        {children}
      </div>
    </div>
  );
}

function HandBadge({ side, on, pulse }: { side: Side; on: boolean; pulse: number }) {
  return (
    <div
      key={pulse}
      className={`flex h-28 w-28 items-center justify-center rounded-full border-[6px] text-6xl transition-colors duration-100 ${
        pulse ? 'hpulse' : ''
      } ${on ? 'border-[#39ff14] bg-[#39ff14]/40 shadow-[0_0_40px_#39ff14]' : 'border-white/40 bg-black/40'}`}
      aria-label={side === 'L' ? '왼손' : '오른손'}
    >
      <span style={{ transform: side === 'L' ? 'scaleX(-1)' : undefined }}>✋</span>
    </div>
  );
}

const MISSING: Record<string, { icon: string; text: string }> = {
  person: { icon: '👀', text: '카메라 앞으로' },
  arms: { icon: '💪', text: '두 팔이 보이게' },
  hips: { icon: '🧍', text: '허리까지 보이게' },
  legs: { icon: '🦵', text: '발끝까지 보이게' },
};

export function StudentHud({ hud, preset, bodyMode, swingAt }: { hud: HudState; preset: PresetDef; bodyMode: BodyMode; swingAt: number }) {
  const [pulse, setPulse] = useState<Record<Side, number>>({ L: 0, R: 0 });
  const [, force] = useState(0);

  useEffect(() => haptics.onPulse((side) => setPulse((p) => ({ ...p, [side]: p[side] + 1 }))), []);

  // 스윙 표시·이벤트 표시를 시간 지나면 지우기 위한 재렌더
  useEffect(() => {
    const id = setTimeout(() => force((n) => n + 1), 700);
    return () => clearTimeout(id);
  }, [swingAt, hud.lastEvent]);

  const now = performance.now();
  const recentEvent = hud.lastEvent && now - hud.lastEvent.at < 1300 ? hud.lastEvent.type : null;
  const swingRecent = now - swingAt < 450;

  if (hud.phase === 'loading') {
    return (
      <Center>
        <div className="h-24 w-24 animate-spin rounded-full border-8 border-white/20 border-t-cyan-300" />
        <div className="mt-6 text-3xl font-bold text-white/80">준비 중…</div>
      </Center>
    );
  }

  if (hud.phase === 'error') {
    return (
      <Center>
        <div className="max-w-xl rounded-2xl bg-red-950/90 p-6 text-center text-xl leading-relaxed text-red-100 ring-2 ring-red-400">
          ⚠️ {hud.error}
        </div>
      </Center>
    );
  }

  if (hud.phase === 'calibrating') {
    const m = hud.missing ? MISSING[hud.missing] : null;
    return (
      <Center>
        <Ring value={hud.calib} size={230} color="#00e5ff">
          {bodyMode === 'upper' ? '🧑‍🦽' : '🧍'}
        </Ring>
        <div className="mt-5 text-6xl font-black text-white drop-shadow-[0_3px_0_#000]">가만히!</div>
        {m && (
          <div className="mt-4 rounded-2xl bg-black/60 px-6 py-3 text-4xl font-bold text-yellow-300">
            {m.icon} {m.text}
          </div>
        )}
      </Center>
    );
  }

  const ready = hud.stage === 'ready';
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* 별 개수 */}
      <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/55 px-7 py-2 text-5xl font-black text-yellow-300">
        <span>⭐</span>
        <span className="tabular-nums">{hud.stars}</span>
      </div>

      {/* 유지 진행 링 / 콤보 준비 링 */}
      <div className="absolute left-6 top-6">
        {ready ? (
          <div className="flex flex-col items-center">
            <Ring value={hud.readyLeft} size={150} color="#ffd400">
              🏏
            </Ring>
            <div className="mt-2 animate-pulse text-4xl font-black text-yellow-300 drop-shadow-[0_3px_0_#000]">휘둘러!</div>
          </div>
        ) : (
          <Ring value={hud.stage === 'cooldown' ? 1 : hud.progress} size={150} color={hud.stage === 'cooldown' ? '#ffd400' : '#39ff14'}>
            {preset.emoji}
          </Ring>
        )}
      </div>

      {/* 성공·타격 순간 큰 아이콘 */}
      {recentEvent && recentEvent !== 'readyTimeout' && (
        <div className="pop absolute left-1/2 top-1/3 text-[11rem] drop-shadow-[0_6px_0_#000]">
          {recentEvent === 'hit' ? '💥' : recentEvent === 'ready' ? '⚡' : '🎉'}
        </div>
      )}

      {/* 좌/우 손 (거울 화면이므로 학생의 왼손이 화면 왼쪽) */}
      <div className="absolute bottom-6 left-6">
        <HandBadge side="L" on={hud.zoneL} pulse={pulse.L} />
      </div>
      <div className="absolute bottom-6 right-6">
        <HandBadge side="R" on={hud.zoneR} pulse={pulse.R} />
      </div>

      {/* 콤보 단계 */}
      {preset.combo && (
        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-full bg-black/55 px-6 py-3 text-5xl">
          <Step on={hud.stage === 'pose'}>🧍</Step>
          <span className="text-white/40">›</span>
          <Step on={ready}>⚡</Step>
          <span className="text-white/40">›</span>
          <Step on={hud.stage === 'cooldown'}>💥</Step>
        </div>
      )}

      {swingRecent && <div className="pop absolute bottom-40 left-1/2 text-8xl">💨</div>}

      {hud.noPerson && (
        <Center>
          <div className="rounded-3xl bg-black/70 px-10 py-6 text-center">
            <div className="text-8xl">👀</div>
            <div className="mt-2 text-4xl font-bold text-white">카메라 앞으로</div>
          </div>
        </Center>
      )}
    </div>
  );
}

function Step({ on, children }: { on: boolean; children: ReactNode }) {
  return <span className={`inline-block transition-all duration-150 ${on ? 'scale-125 opacity-100' : 'opacity-35 grayscale'}`}>{children}</span>;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">{children}</div>;
}
