import { defineConfig } from 'vite';

// `base: './'` makes the build work from any sub-path, e.g. GitHub Pages
// (https://<user>.github.io/<repo>/) as well as the root of a domain.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
  },
});
