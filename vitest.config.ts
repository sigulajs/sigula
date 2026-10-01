import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/test/**/*.{test,spec}.ts'],
    // globals: true, // 可选：开启后不用手动 import describe/it/expect
  },
});
