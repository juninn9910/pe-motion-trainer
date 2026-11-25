// 왼손/오른손 조이콘 연결 버튼 (시작 화면·교사 패널 공용).
// 브라우저 보안 규칙상 첫 연결은 반드시 버튼 클릭 → 장치 선택 창에서 골라야 한다. 이후엔 자동 재연결.

import { useState } from 'react';
import type { Side } from '../types';
import { haptics, joycons } from '../feedback';
import { useJoyCons } from '../hooks/useJoyCons';

const LABEL: Record<Side, string> = { L: '왼손 조이콘', R: '오른손 조이콘' };

export function JoyConConnect({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const { left, right, supported } = useJoyCons();
  const [busy, setBusy] = useState<Side | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lg = size === 'lg';

  if (!supported) {
    return (
      <p className="rounded-xl bg-amber-900/50 px-4 py-3 text-sm text-amber-100">
        이 브라우저는 조이콘 연결을 지원하지 않습니다. <b>Chrome 또는 Edge</b>로 열어 주세요. (카메라만으로는 그대로 사용 가능 · 스윙은 스페이스바)
      </p>
    );
  }

  const connect = async (side: Side) => {
    setErr(null);
    setBusy(side);
    try {
      await joycons.request(side); // 이 안에서 장치 선택 창이 뜬다
      if (joycons.get(side)?.ready) haptics.play(side, 'testSoft'); // 연결 확인 진동
      else if (joycons.lastError) setErr(joycons.lastError);
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name !== 'NotFoundError' && name !== 'AbortError') setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={lg ? 'w-full max-w-lg' : 'w-full'}>
      <div className="grid grid-cols-2 gap-3">
        {(['L', 'R'] as Side[]).map((side) => {
          const pad = side === 'L' ? left : right;
          const ok = !!pad?.ready;
          const working = busy === side || (!!pad && !ok);
          return (
            <button
              key={side}
              onClick={() => (ok ? haptics.play(side, 'testSoft') : connect(side))}
              disabled={working}
              className={`flex flex-col items-center rounded-2xl ring-2 transition ${lg ? 'px-3 py-4' : 'px-2 py-3'} ${
                ok ? 'bg-emerald-500/20 ring-emerald-400 hover:bg-emerald-500/30' : 'bg-sky-500/20 ring-sky-400 hover:bg-sky-500/35'
              } disabled:opacity-60`}
            >
              <span className={lg ? 'text-4xl' : 'text-2xl'}>{ok ? '✅' : '🎮'}</span>
              <span className={`mt-1 font-bold ${lg ? 'text-lg' : 'text-sm'}`}>{LABEL[side]}</span>
              <span className={`mt-0.5 ${lg ? 'text-sm' : 'text-xs'} ${ok ? 'text-emerald-300' : 'text-sky-200'}`}>
                {working ? '연결 중…' : ok ? '연결됨 · 누르면 진동' : '눌러서 연결'}
              </span>
              {ok && pad?.battery && (
                <span className="mt-0.5 text-xs text-neutral-400">
                  🔋 {'■'.repeat(pad.battery.level)}
                  {'□'.repeat(4 - pad.battery.level)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {err && <p className="mt-2 rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100">⚠️ {err}</p>}
      <p className={`mt-2 text-neutral-400 ${lg ? 'text-sm' : 'text-xs'}`}>
        선택 창이 비어 있으면: 조이콘 옆면(레일)의 작은 <b>SYNC 버튼</b>을 3초 눌러 Windows 설정 → Bluetooth → 장치 추가에서 먼저 등록하세요.
      </p>
    </div>
  );
}
