import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base: './' → GitHub Pages(하위 경로)·Netlify 어디에 올려도 상대 경로로 동작
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: 'localhost' },
});
