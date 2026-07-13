import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'build/**',
      '.svelte-kit/**',
      'static/**',
      'src/service-worker.js',
      'scripts/generated-*.mjs',
      'experiments/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      // APP_COMMIT_ID is a Vite `define` global (see vite.config.js),
      // declared for TS in src/app.d.ts — not visible to non-type-aware
      // ESLint without listing it here too.
      globals: { ...globals.browser, ...globals.node, APP_COMMIT_ID: 'readonly' },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ['**/*.test.js', '**/*.test.ts'],
    languageOptions: {
      // Vitest's `describe`/`it`/`expect` are configured as globals
      // project-wide (see vite.config.js test.globals) rather than
      // imported per file.
      globals: globals.vitest,
    },
  },
  {
    // Plain .js modules in this project rely on JSDoc-based typing (see
    // tsconfig.base.json's allowJs+checkJs, which `npm run check` type-
    // checks for real) rather than TypeScript files, so full type-aware
    // ESLint linting doesn't apply here — keep just the JS-shaped
    // correctness rules. Known tradeoff: this means `no-unused-vars`
    // can't see that an import is used only inside a JSDoc @type/@param
    // comment (e.g. a CodeMirror type referenced solely for annotations)
    // and will warn on it as if it were dead code — svelte-check's real
    // type checker knows better, so verify there before deleting an
    // "unused" import this rule flags.
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    rules: {
      // Prefixing an intentionally-unused arg/var with _ is the project's
      // existing convention for "required by signature, not used here".
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // src/ is app runtime code — a stray console.log there is usually a
    // forgotten debug statement.
    files: ['src/**'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // scripts/ is Node CLI build tooling, where console output *is* the
    // program's job — no-console would just flag every normal print.
    files: ['scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },
)
