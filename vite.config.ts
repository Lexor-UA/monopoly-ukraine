import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const norm = id.replace(/\\/g, '/');
          if (
            norm.includes('node_modules/react/') ||
            norm.includes('node_modules/react-dom/') ||
            norm.includes('node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          if (
            norm.includes('node_modules/framer-motion') ||
            norm.includes('node_modules/motion-') ||
            norm.includes('node_modules/canvas-confetti')
          ) {
            return 'motion-vendor';
          }
          if (
            norm.includes('node_modules/socket.io') ||
            norm.includes('node_modules/engine.io') ||
            norm.includes('node_modules/peerjs') ||
            norm.includes('node_modules/webrtc-adapter')
          ) {
            return 'network-vendor';
          }
          if (norm.includes('node_modules/lucide-react')) {
            return 'icons-vendor';
          }
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
