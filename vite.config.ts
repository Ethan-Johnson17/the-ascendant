import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Vite is the dev server and production bundler.
// Tailwind v4 is configured through CSS (`src/styles/index.css`), not a JS config file.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
});
