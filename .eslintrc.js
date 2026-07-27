module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es2021: true,
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  overrides: [
    {
      files: ['*.vue'],
      parser: 'vue-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
        ecmaVersion: 2021,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      extends: ['plugin:vue/base'],
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'dist 2/',
    '.eslintrc.js',
    '*.config.js',
    'admin/dist/',
    'backend/dist/'
  ],
  rules: {
    // 关闭一些过于严格的规则，防止大量旧代码报错导致检查失败
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/no-var-requires': 'warn',
    'no-empty': 'warn',
    'no-constant-condition': 'warn',
    'no-mixed-spaces-and-tabs': 'warn',
    'no-case-declarations': 'warn',
    'no-extra-boolean-cast': 'warn',
    'prefer-const': 'warn',
  },
};
