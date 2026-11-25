import { useEffect, useMemo, useState } from 'react';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { StartScreen } from './components/StartScreen';
import { TeacherPanel } from './components/TeacherPanel';
import { TrainerView, type DebugInfo } from './components/TrainerView';
import { haptics, joycons, sfx } from './feedback';
import { useCamera } from './hooks/useCamera';
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
          <IconButton label="조이콘 진단" onClick={() => setDiagOpen(true)}>
            🎮
          </IconButton>
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
