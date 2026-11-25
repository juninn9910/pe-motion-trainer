import { useSyncExternalStore } from 'react';
import { joycons } from '../joycon/JoyConManager';

/** 조이콘 연결 상태가 바뀔 때마다 다시 그린다 */
export function useJoyCons() {
  useSyncExternalStore(joycons.subscribe, joycons.getVersion);
  return { left: joycons.get('L'), right: joycons.get('R'), supported: joycons.supported, error: joycons.lastError };
}
