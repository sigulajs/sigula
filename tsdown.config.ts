import {defineConfig} from 'tsdown';

const ENTRY_NAME = 'sigula';

export default defineConfig({
  entry: {[ENTRY_NAME]: 'src/index.ts'},
  format: ['esm'],
  minify: true,
  sourcemap: true,
  target: 'esnext',
  platform: 'browser',
  dts: true,
  exports: {
    customExports(pkg) {
      pkg['.'] = {
        types: `./dist/${ENTRY_NAME}.d.ts`,
        import: `./dist/${ENTRY_NAME}.js`,
        default: `./dist/${ENTRY_NAME}.js`,
      };
      pkg['./package.json'] = './package.json';
      return pkg;
    },
  },
  publint: true,
});
