module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'core',
        'pii',
        'sentiment',
        'semantic-search',
        'chat',
        'playground',
        'workspace',
        'deps',
        'release',
      ],
    ],
    'scope-empty': [1, 'never'],
  },
};
