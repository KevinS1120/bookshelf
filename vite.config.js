import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative paths so the build works under https://<user>.github.io/<repo>/
  base: './',
  // Shown in Settings, so you can tell which version a device is running.
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') },
  build: { target: 'es2020' },
  optimizeDeps: { esbuildOptions: { target: 'es2020' } },
  // Port 5173 is registered as a sign-in redirect address for local development.
  server: { port: 5173, strictPort: true },
});
