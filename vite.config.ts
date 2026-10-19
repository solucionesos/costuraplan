import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 6000,
    host: true,
  },
  preview: {
    port: 6000,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/app.[ext]',
      },
    },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
