import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { builtinModules } from 'node:module';

const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/extension.ts'),
      formats: ['cjs'],
      fileName: () => 'extension.js',
    },
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      external: [
        'vscode',
        '@lancedb/lancedb',
        'web-tree-sitter',
        'tree-sitter-wasms',
        'ignore',
        ...nodeExternals,
      ],
      output: {
        entryFileNames: 'extension.js',
      },
    },
    target: 'node22',
    minify: false,
  },
  resolve: {
    conditions: ['node'],
  },
});
