module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['import'],
  extends: ['eslint:recommended', 'plugin:import/recommended'],
  rules: {
    'no-alert': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'import/no-unresolved': 'off',
  },
};
