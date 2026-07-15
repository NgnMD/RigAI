import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Allow relative paths for GitHub Pages subdirectories
  server: {
    port: 3000,
    open: true
  }
});
