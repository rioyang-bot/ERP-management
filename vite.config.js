import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    // HTTPS 設定（使用 Private CA 憑證）
    https: {
      key: fs.readFileSync(path.resolve('./ssl/server.key')),
      cert: fs.readFileSync(path.resolve('./ssl/server.crt')),
    },
    proxy: {
      '/api': {
        target: 'https://127.0.0.1:5566',
        changeOrigin: true,
        secure: false,  // 信任 Private CA 憑證
      },
      '/uploads': {
        target: 'https://127.0.0.1:5566',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/tests/setup.js'
  }
})
