module.exports = {
  dependencies: {
    // Exclude published packages from autolinking - we use local libs instead
    '@local-intelligence/core': {
      platforms: {
        android: null,
        ios: null,
      },
    },
    '@local-intelligence/pii': {
      platforms: {
        android: null,
        ios: null,
      },
    },
    '@local-intelligence/sentiment': {
      platforms: {
        android: null,
        ios: null,
      },
    },
    '@local-intelligence/semantic-search': {
      platforms: {
        android: null,
        ios: null,
      },
    },
  },
};
