import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    tailwindcss(),
    crx({ manifest })
  ],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        extractor: 'src/content/extractor.ts'
      }
    }
  }
});
