import { useEffect, useState } from 'react';

export interface CameraState {
  stream: MediaStream | null;
  error: string | null;
  devices: MediaDeviceInfo[];
}

function describe(err: unknown): string {
  const name = (err as DOMException)?.name;
  if (name === 'NotAllowedError') return '카메라 권한이 거부되었습니다. 주소창 왼쪽 자물쇠 → 카메라 → 허용 후 새로고침하세요.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '사용할 수 있는 카메라를 찾지 못했습니다.';
  if (name === 'NotReadableError') return '다른 프로그램(줌, 팀즈 등)이 카메라를 쓰고 있습니다. 그 프로그램을 닫고 새로고침하세요.';
  return `카메라를 열 수 없습니다: ${(err as Error)?.message ?? err}`;
}

export function useCamera(enabled: boolean, deviceId: string): CameraState {
  const [state, setState] = useState<CameraState>({ stream: null, error: null, devices: [] });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        setState({ stream, error: null, devices });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, stream: null, error: describe(err) }));
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled, deviceId]);

  return state;
}
