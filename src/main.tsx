import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// StrictMode는 쓰지 않는다: 개발 모드에서 effect가 두 번 돌면 카메라·HID 장치·WASM 모델을 이중으로 열기 때문.
createRoot(document.getElementById('root')!).render(<App />);
