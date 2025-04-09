import jest from "eslint-plugin-jest"
import globals from "globals"
import path from "node:path"
import { fileURLToPath } from "node:url"
import js from "@eslint/js"
import { FlatCompat } from "@eslint/eslintrc"
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  {
    ignores: [
      "**/.eslintrc.js",
      "**/dist",
      "**/build",
      "**/node_modules",
      "**/rollup.config.js",
      "**/jest.config.js",
    ],
  },
  {
    plugins: {
      jest,
    },

    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
        ...globals.commonjs,
        ...jest.environments.globals.globals,
      },

      ecmaVersion: 2024,
      sourceType: "commonjs",
    },

    rules: {
      curly: "warn",
      "node/no-unsupported-features/es-syntax": 0,
    },
  },
  // Any other config imports go at the top
  eslintPluginPrettierRecommended,
]
