import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'src-tauri', 'src/typed-router.d.ts']),
  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      ecmaVersion: 2022,
      // definePage is a compiler macro from vue-router's file-based routing (like defineProps).
      globals: { ...globals.browser, definePage: 'readonly' },
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] }
    },
    rules: {
      // Nuxt UI components are multi-word already; single-file views like App.vue are fine.
      'vue/multi-word-component-names': 'off'
    }
  }
])
