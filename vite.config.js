import { defineConfig } from 'vite';

export default defineConfig({
  css: {
    postcss: './postcss.config.js',
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  server: {
    hmr: true
  }
});

