import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import nextPlugin from '@next/eslint-plugin-next';

export default defineConfig([
  {
    ignores: [
      '.next/**',
      '.open-next/**',
      'dist/**',
      'generated/**',
      'infra/cdk/cdk.out/**',
      'infra/cdk/dist/**',
      'infra/cdk/functions/**',
      'node_modules/**',
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  nextPlugin.flatConfig.coreWebVitals,
  {
    settings: {
      next: {
        rootDir: ['.'],
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
]);
