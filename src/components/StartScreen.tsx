import { JoyConConnect } from './JoyConConnect';

export function StartScreen({ onStart, onOpenDiagnostics, sim }: { onStart: () => void; onOpenDiagnostics: () => void; sim: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 overflow-y-auto bg-gradient-to-b from-neutral-900 to-black px-6 py-8 text-center">
      <div>
        <div className="text-7xl">🪞</div>
        <h1 className="mt-2 text-5xl font-black tracking-tight">동작 거울</h1>
        <p className="mt-3 text-lg text-neutral-400">화면 속 친구 모양을 따라 하면 손이 '부르르' 떨려요</p>
      </div>

      <JoyConConnect size="lg" />

      <button
        onClick={onStart}
        className="rounded-full bg-emerald-500 px-16 py-6 text-4xl font-black text-black shadow-[0_0_40px_rgba(16,185,129,0.6)] transition hover:scale-105 hover:bg-emerald-400"
      >
        ▶ 시작
      </button>

      <div className="flex flex-col items-center gap-2">
        <button onClick={onOpenDiagnostics} className="text-sm text-neutral-400 underline underline-offset-4 hover:text-neutral-200">
          조이콘 진단(진동·스윙 시험)
        </button>
        <p className="max-w-lg text-xs leading-relaxed text-neutral-500">
          {sim
            ? '시뮬레이션 모드: 카메라 대신 가상 학생이 움직입니다.'
            : '조이콘 없이도 시작할 수 있습니다. 카메라 영상은 이 컴퓨터 안에서만 분석되며 저장하거나 외부로 보내지 않습니다.'}
        </p>
      </div>
    </div>
  );
}
