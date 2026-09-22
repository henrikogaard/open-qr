import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    ignores: ['build/**', '.svelte-kit/**', 'node_modules/**', 'data/**', 'playwright-report/**', 'test-results/**']
  },
  {
    rules: {
      // The codebase intentionally uses `as any` at SQLite row boundaries;
      // typing those properly is a follow-up, not this config's job.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        extraFileExtensions: ['.svelte']
      }
    },
    rules: {
      // Migrating every <a> to resolve() is a worthwhile but sweeping
      // follow-up; off until then so the rule doesn't scream at static hrefs.
      'svelte/no-navigation-without-resolve': 'off',
      // Visible as warnings until each block gets proper keys.
      'svelte/require-each-key': 'warn'
    }
  },
  {
    files: ['scripts/**'],
    languageOptions: { globals: { ...globals.node } }
  }
);
