import { useEffect, useMemo, useState } from 'react';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { StartScreen } from './components/StartScreen';
import { TeacherPanel } from './components/TeacherPanel';
import { TrainerView, type DebugInfo } from './components/TrainerView';
import { haptics, joycons, sfx } from './feedback';
import { useCamera } from './hooks/useCamera';
import { useJoyCons } from './hooks/useJoyCons';
import { useSettings } from './hooks/useSettings';
import type { BodyProfile } from './pose/calibration';

export default function App() {
  const [settings, update] = useSettings();
  /** 주소 끝에 ?sim → 카메라 없이 가상 학생으로 화면 점검 */
  const sim = useMemo(() => new URLSearchParams(window.location.search).has('sim'), []);
  const [started, setStarted] = useState(false);
  const cam = useCamera(started && !sim, settings.cameraId);

  const [panelOpen, setPanelOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [recalKey, setRecalKey] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [profile, setProfile] = useState<BodyProfile | null>(null);

  useEffect(() => {
    void joycons.autoConnect();
  }, []);
  useEffect(() => {
    haptics.intensity = settings.vibration;
  }, [settings.vibration]);
  useEffect(() => {
    sfx.enabled = settings.sound;
  }, [settings.sound]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setDiagOpen(false);
      setPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const start = () => {
    sfx.unlock();
    setStarted(true);
  };

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black text-white">
      {!started ? (
        <StartScreen onStart={start} onOpenDiagnostics={() => setDiagOpen(true)} sim={sim} />
      ) : cam.error && !sim ? (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-xl rounded-2xl bg-red-950/80 p-6 text-center text-xl leading-relaxed ring-2 ring-red-400">📷 {cam.error}</div>
        </div>
      ) : (
        <TrainerView
          settings={settings}
          stream={cam.stream}
          sim={sim}
          recalKey={recalKey}
          resetKey={resetKey}
          onDebug={setDebug}
          onProfile={setProfile}
        />
      )}

      {started && (
        <div className="fixed right-3 top-3 z-20 flex gap-2">
          <JoyConPill onClick={() => setPanelOpen(true)} />
          <IconButton label="교사 설정" onClick={() => setPanelOpen((o) => !o)}>
            ⚙️
          </IconButton>
        </div>
      )}

      <TeacherPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        settings={settings}
        update={update}
        profile={profile}
        debug={debug}
        cameras={cam.devices}
        sim={sim}
        onRecalibrate={() => setRecalKey((n) => n + 1)}
        onResetStars={() => setResetKey((n) => n + 1)}
        onOpenDiagnostics={() => setDiagOpen(true)}
      />
      <DiagnosticsModal open={diagOpen} onClose={() => setDiagOpen(false)} swingLevel={settings.swingLevel} />
    </div>
  );
}

/** 오른쪽 위 조이콘 상태 표시. 하나라도 안 붙어 있으면 눈에 띄게, 둘 다 붙으면 흐리게 */
function JoyConPill({ onClick }: { onClick: () => void }) {
  const { left, right, supported } = useJoyCons();
  if (!supported) return null;
  const l = !!left?.ready;
  const r = !!right?.ready;
  const all = l && r;
  const dot = (on: boolean) => <span className={`inline-block h-3 w-3 rounded-full ${on ? 'bg-emerald-400' : 'bg-neutral-500'}`} />;
  return (
    <button
      onClick={onClick}
      title="조이콘 연결"
      className={`flex h-12 items-center gap-2 rounded-full px-4 text-base font-bold ring-2 transition ${
        all ? 'bg-black/50 opacity-60 ring-white/20 hover:opacity-100' : 'bg-sky-600/90 ring-sky-300 hover:bg-sky-500'
      }`}
    >
      <span className="text-xl">🎮</span>
      {all ? '' : '조이콘 연결'}
      <span className="flex items-center gap-1 text-xs font-semibold">
        L {dot(l)} R {dot(r)}
      </span>
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-2xl opacity-60 ring-1 ring-white/20 transition hover:opacity-100"
    >
      {children}
    </button>
  );
}
