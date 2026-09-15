import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';

// Inject the build hash into the service worker so every deploy busts the SW cache
function swVersionPlugin() {
  return {
    name: 'sw-version',
    closeBundle() {
      const swPath = 'dist/sw.js';
      const hash = Date.now().toString(36);
      let sw = readFileSync(swPath, 'utf8');
      sw = sw.replace('kitchen-dashboard-${BUILD_VERSION}', `kitchen-dashboard-${hash}`);
      writeFileSync(swPath, sw);
    }
  };
}

export default defineConfig({
  plugins: [react(), swVersionPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist'
  }
});
