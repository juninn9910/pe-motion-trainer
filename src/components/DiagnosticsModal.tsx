// 조이콘 하드웨어 진단: 연결 상태, 배터리, 좌/우 진동 수동 테스트, 실시간 IMU·스윙 감지 확인.

import { useEffect, useRef, useState } from 'react';
import type { Side } from '../types';
import { haptics, joycons } from '../feedback';
import type { ImuReading, JoyCon } from '../joycon/JoyCon';
import { SwingDetector, swingThreshold } from '../joycon/swing';
import { useJoyCons } from '../hooks/useJoyCons';

interface Props {
  open: boolean;
  onClose: () => void;
  swingLevel: number;
}

export function DiagnosticsModal({ open, onClose, swingLevel }: Props) {
  const { left, right, supported, error } = useJoyCons();
  const [imu, setImu] = useState<Partial<Record<Side, ImuReading>>>({});
  const [swingFlash, setSwingFlash] = useState<Record<Side, number>>({ L: 0, R: 0 });
  const [connectErr, setConnectErr] = useState<string | null>(null);
  const latest = useRef<Partial<Record<Side, ImuReading>>>({});
  const levelRef = useRef(swingLevel);
  levelRef.current = swingLevel;

  useEffect(() => {
    if (!open) return;
    const det = new SwingDetector(
      () => levelRef.current,
      (side) => setSwingFlash((f) => ({ ...f, [side]: performance.now() })),
    );
    const off = joycons.onImu((r) => {
      latest.current[r.side] = r;
      det.feed(r);
    });
    const id = setInterval(() => setImu({ ...latest.current }), 100);
    return () => {
      off();
      clearInterval(id);
    };
  }, [open]);

  if (!open) return null;

  const connect = async (side: Side) => {
    setConnectErr(null);
    try {
      await joycons.request(side);
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name !== 'NotFoundError' && name !== 'AbortError') setConnectErr((err as Error).message);
    }
  };

  const th = swingThreshold(swingLevel);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-neutral-900 p-6 text-neutral-100 shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">🎮 조이콘 연결·진단</h2>
          <button className="rounded-lg px-3 py-1 text-2xl hover:bg-white/10" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <Badge ok={window.isSecureContext}>보안 연결(HTTPS·localhost)</Badge>
          <Badge ok={'hid' in navigator}>WebHID 지원(Chrome·Edge)</Badge>
        </div>

        {!supported ? (
          <p className="rounded-xl bg-amber-900/40 p-4 text-amber-100">
            이 브라우저에서는 조이콘을 쓸 수 없습니다. <b>Chrome 또는 Edge</b>로 열어 주세요. 조이콘 없이도 카메라만으로 모든 동작을 연습할 수 있고,
            스윙은 <b>스페이스바</b>로 대신합니다.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <PadCard side="L" pad={left} imu={imu.L} flashAt={swingFlash.L} onConnect={() => connect('L')} />
            <PadCard side="R" pad={right} imu={imu.R} flashAt={swingFlash.R} onConnect={() => connect('R')} />
          </div>
        )}

        {(connectErr || error) && <p className="mt-3 rounded-lg bg-red-900/50 p-3 text-sm text-red-100">⚠️ {connectErr ?? error}</p>}

        <div className="mt-5 space-y-1 text-sm text-neutral-400">
          <p>
            · 스윙 기준 {swingLevel}단계: 회전 {th.gyroDps}°/s 이상 또는 흔들림 {th.accDevG}g 이상이면 💥
          </p>
          <p>· 조이콘 없이 테스트: 스페이스바 = 스윙</p>
          <p>· 연결이 안 되면: Steam·BetterJoy 같은 조이콘 프로그램을 끄고, 조이콘을 PC 블루투스에서 다시 페어링하세요.</p>
        </div>
      </div>
    </div>
  );
}

function PadCard({ side, pad, imu, flashAt, onConnect }: { side: Side; pad?: JoyCon; imu?: ImuReading; flashAt: number; onConnect: () => void }) {
  const connected = !!pad?.ready;
  const swinging = performance.now() - flashAt < 400;
  const gyro = imu ? Math.hypot(imu.gyro.x, imu.gyro.y, imu.gyro.z) : 0;
  const acc = imu ? Math.hypot(imu.acc.x, imu.acc.y, imu.acc.z) : 0;
  return (
    <div className={`rounded-xl p-4 ring-2 ${connected ? 'bg-emerald-950/40 ring-emerald-500/60' : 'bg-white/5 ring-white/10'}`}>
      <div className="flex items-center justify-between">
        <div className="text-lg font-bold">{side === 'L' ? '왼쪽 조이콘 (L)' : '오른쪽 조이콘 (R)'}</div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${connected ? 'bg-emerald-500 text-black' : pad ? 'bg-amber-500 text-black' : 'bg-neutral-700'}`}>
          {connected ? '연결됨' : pad ? '초기화 중' : '미연결'}
        </span>
      </div>

      {pad?.battery && (
        <div className="mt-1 text-sm text-neutral-300">
          🔋 {'■'.repeat(pad.battery.level)}
          {'□'.repeat(4 - pad.battery.level)} {pad.battery.charging ? '⚡충전 중' : ''}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!pad && (
          <button className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-white hover:bg-sky-400" onClick={onConnect}>
            연결하기
          </button>
        )}
        {connected && (
          <>
            <button className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20" onClick={() => haptics.play(side, 'testSoft')}>
              진동 약하게
            </button>
            <button className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20" onClick={() => haptics.play(side, 'testStrong')}>
              진동 세게
            </button>
            <button className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20" onClick={() => haptics.play(side, 'impact')}>
              타격
            </button>
            <button className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-white/10" onClick={() => void joycons.disconnect(side)}>
              연결 해제
            </button>
          </>
        )}
      </div>

      {connected && (
        <div className="mt-4 space-y-2 text-sm">
          <Meter label="회전" value={gyro} max={1500} unit="°/s" />
          <Meter label="가속" value={acc} max={4} unit="g" digits={2} />
          <div className={`rounded-lg py-2 text-center text-2xl font-black transition ${swinging ? 'bg-yellow-400 text-black' : 'bg-white/5 text-white/30'}`}>
            💥 스윙!
          </div>
        </div>
      )}
    </div>
  );
}

function Meter({ label, value, max, unit, digits = 0 }: { label: string; value: number; max: number; unit: string; digits?: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <span className="tabular-nums">
          {value.toFixed(digits)} {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-white/10">
        <div className="h-full bg-sky-400" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: string }) {
  return <span className={`rounded-full px-3 py-1 ${ok ? 'bg-emerald-900/60 text-emerald-200' : 'bg-red-900/60 text-red-200'}`}>{ok ? '✓' : '✗'} {children}</span>;
}
