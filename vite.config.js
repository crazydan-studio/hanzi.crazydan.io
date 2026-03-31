import { readFileSync } from 'fs';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import htmlMinifier from 'vite-plugin-html-minifier';

const srcDir = resolve(__dirname, 'src');
const thanksHtml = readFileSync(
  resolve(srcDir, 'fragment/thanks.html'),
  'utf-8'
);
const ziesHtml = readFileSync(resolve(srcDir, 'fragment/zies.html'), 'utf-8');

export default defineConfig({
  root: srcDir,
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'index.html': resolve(srcDir, 'index.html'),
        zi: resolve(srcDir, 'zi/index.html'),
        'zi/commons': resolve(srcDir, 'zi/commons/index.html'),
        pinyin: resolve(srcDir, 'pinyin/index.html')
      }
    }
  },
  plugins: [
    tailwindcss(),
    htmlMinifier({
      minify: true
    }),
    {
      name: 'inject-html-fragment',
      transformIndexHtml(html) {
        return html
          .replace('<!--% thanksHtmlFragment %-->', thanksHtml)
          .replace('<!--% ziesHtmlFragment %-->', ziesHtml);
      }
    }
  ]
});
