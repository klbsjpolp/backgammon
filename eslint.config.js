import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: ['coverage', 'dist', 'dist-types', '**/dist', '**/dist-types'],
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    ignores: [
      'apps/**/tests/**/*.{ts,tsx}',
      'packages/**/tests/**/*.{ts,tsx}',
      '**/__tests__/**/*.{ts,tsx}',
      '**/*.{test,spec}.{ts,tsx}',
    ],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          // `core` and `runtime` are composite builds rooted at `src`, so their
          // own `vitest.config.ts` cannot join their tsconfig without breaking
          // `rootDir` — and a file in no project is a parsing *error* here, not
          // a skipped one. The default project lints them on their own.
          allowDefaultProject: ['packages/*/vitest.config.ts'],
        },
        tsconfigRootDir,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports', prefer: 'type-imports' },
      ],
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-console': ['error', { allow: ['error', 'info', 'warn'] }],
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    files: ['apps/*/{vite,vitest}.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
    },
  },
  {
    files: [
      'apps/**/tests/**/*.{ts,tsx}',
      'packages/**/tests/**/*.{ts,tsx}',
      '**/__tests__/**/*.{ts,tsx}',
      '**/*.{test,spec}.{ts,tsx}',
    ],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
