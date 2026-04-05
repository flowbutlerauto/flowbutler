module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'google',
  ],
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    'linebreak-style': 'off',
    'require-jsdoc': 'off',
    'max-len': 'off',
    'prefer-arrow-callback': 'off',
    'space-before-function-paren': 'off',
  },
};
