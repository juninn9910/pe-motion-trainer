import { useJoyCons } from '../hooks/useJoyCons';

export function StartScreen({ onStart, onOpenDiagnostics, sim }: { onStart: () => void; onOpenDiagnostics: () => void; sim: boolean }) {
  const { left, right, supported } = useJoyCons();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-gradient-to-b from-neutral-900 to-black px-6 text-center">
      <div>
        <div className="text-8xl">🪞</div>
        <h1 className="mt-3 text-5xl font-black tracking-tight">동작 거울</h1>
        <p className="mt-3 text-lg text-neutral-400">화면 속 친구 모양을 따라 하면 손이 '부르르' 떨려요</p>
      </div>

      <button
        onClick={onStart}
        className="rounded-full bg-emerald-500 px-16 py-6 text-4xl font-black text-black shadow-[0_0_40px_rgba(16,185,129,0.6)] transition hover:scale-105 hover:bg-emerald-400"
      >
        ▶ 시작
      </button>

      <div className="flex flex-col items-center gap-2">
        <button onClick={onOpenDiagnostics} className="rounded-xl bg-white/10 px-5 py-3 text-lg font-semibold hover:bg-white/20">
          🎮 조이콘 연결·진단
          <span className="ml-3 text-sm text-neutral-400">
            L {left?.ready ? '🟢' : '⚪'} · R {right?.ready ? '🟢' : '⚪'}
          </span>
        </button>
        {!supported && <p className="text-sm text-amber-300">이 브라우저는 조이콘(WebHID)을 지원하지 않습니다. 카메라만으로 사용 가능 · 스윙은 스페이스바</p>}
      </div>

      <p className="max-w-lg text-xs leading-relaxed text-neutral-500">
        {sim
          ? '시뮬레이션 모드: 카메라 대신 가상 학생이 움직입니다.'
          : '카메라 영상은 이 컴퓨터 안에서만 분석되며 저장하거나 외부로 보내지 않습니다.'}
      </p>
    </div>
  );
}
