import { defineConfig } from 'vite';
export default defineConfig({
  publicDir: false,
  build: {
    minify: true,
    target: 'es2022',
    outDir: 'dist-embed',
    emptyOutDir: true,
    assetsInlineLimit: 200000, // fonts travel inside the CSS
    cssCodeSplit: false,
    lib: { entry: 'lib/embed.ts', formats: ['es'], fileName: () => 'videoboy.js', cssFileName: 'videoboy' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
