import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    assetsInlineLimit: 0, // Keep chunks cleanly separated for CSP auditing
    sourcemap: false
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist']
  },
  worker: {
    format: 'es'
  },
  server: {
    port: 3000,
    headers: {
      'Content-Security-Policy': "default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none';"
    }
  }
});
