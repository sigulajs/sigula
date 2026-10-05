import path from 'node:path';
import {defineConfig} from 'vite';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      sigula: path.resolve(import.meta.dirname, '../..'),
    },
  },
});
