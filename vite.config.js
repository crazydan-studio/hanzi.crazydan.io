import { readFileSync } from 'fs';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const srcDir = resolve(__dirname, 'src');
const thanksHtml = readFileSync(resolve(srcDir, 'thanks.html'), 'utf-8');

export default defineConfig({
  root: srcDir,
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    rollupOptions: {
      input: {
        zi: resolve(srcDir, 'zi/index.html'),
        'zi/commons': resolve(srcDir, 'zi/commons/index.html'),
        pinyin: resolve(srcDir, 'pinyin/index.html')
      }
    }
  },
  plugins: [
    tailwindcss(),
    {
      name: 'inject-html-fragment',
      transformIndexHtml(html) {
        return html.replace('<!--% thanksHtmlFragment %-->', thanksHtml);
      }
    }
  ]
});
