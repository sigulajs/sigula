import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: {sigula: 'src/index.ts'},
  format: ['esm'],
  minify: true,
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'esnext',
  platform: 'browser',
  exports: true,
});
