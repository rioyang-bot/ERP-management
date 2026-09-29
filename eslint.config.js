import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // argsIgnorePattern：用不到但必須佔位的參數命名為 _xxx，
      // 例如 map((_, i) => ...) 的第一個參數。
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      // 列印單據用全形空格 U+3000 把兩字標題撐成四字寬（業　　務 對齊 聯絡人員），
      // 這是中文表單的排版手法，換成半形會改掉印出來的版面。
      // 這條規則要抓的是混進「程式碼」裡的隱形空白，顯示文字不在此列。
      'no-irregular-whitespace': ['error', {
        skipStrings: true, skipTemplates: true, skipJSXText: true, skipComments: true,
      }],
    },
  },
  // Electron main process files run in Node.js, not the browser
  {
    files: ['electron/**/*.{js,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // 伺服器端與各種工具腳本同樣跑在 Node.js —— 先前只宣告了瀏覽器 globals，
  // 這些檔案用到 process、__dirname 時全部被報成 no-undef。
  {
    files: [
      'server.js',
      'server/**/*.{js,cjs,mjs}',
      'database/**/*.{js,cjs,mjs}',
      'scripts/**/*.{js,cjs,mjs}',
      'scratch/**/*.{js,cjs,mjs}',
      'db-migrate.js',
      '*.config.{js,cjs,mjs}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  // 測試跑在 vitest（Node）底下，會用到 global 之類的 Node 全域
  {
    files: ['src/tests/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
])
