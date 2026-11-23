import { defineConfig } from 'vitest/config';

// 源码里为了浏览器原生 ESM 使用 "./x.js" 形式引用；测试里把扩展名去掉即可解析到 .ts
export default defineConfig({
  resolve: {
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' }],
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
