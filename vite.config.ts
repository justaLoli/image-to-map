// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    /**
     * 将 minify 设置为 false 可以禁用所有压缩。
     * 也可以设置为 'esbuild' 或 'terser'（默认）来选择不同的压缩工具。
     */
    minify: false,
    
    // 如果你使用 terser，可以更细致地控制
    // terserOptions: {
    //   compress: {
    //     // 关闭特定类型的压缩
    //     drop_console: false, 
    //     dead_code: true,
    //   },
    //   mangle: false, // 关闭变量名混淆
    //   format: {
    //     beautify: true, // 美化输出，让代码可读
    //     comments: true, // 保留注释
    //   },
    // },
  },
});