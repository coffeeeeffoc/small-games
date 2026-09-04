import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const sharedIgnores = ['**/dist/**', '**/coverage/**', '**/.turbo/**'];

export const baseConfig = tseslint.config(
  { ignores: sharedIgnores },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'max-lines': [
        'warn',
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
);

export const reactConfig = tseslint.config(...baseConfig, {
  files: ['**/*.{ts,tsx}'],
  languageOptions: {
    globals: globals.browser,
  },
  plugins: {
    'react-hooks': reactHooks,
    'react-refresh': reactRefresh,
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
});

export const nodeConfig = {
  files: ['**/*.{js,mjs,cjs}'],
  languageOptions: {
    globals: globals.node,
  },
};
