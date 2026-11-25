// 앱 전역 피드백 객체: 진동(조이콘) + 효과음. 화면 표시용 진동 이벤트도 여기서 나간다.
import { Haptics } from './joycon/haptics';
import { joycons } from './joycon/JoyConManager';

export const haptics = new Haptics((side, bytes) => joycons.rumble(side, bytes));
export { sfx } from './audio/sfx';
export { joycons };
