const path = require('path');

module.exports = {
  testEnvironment: 'node',
  rootDir: path.resolve(__dirname),
  roots: [
    path.resolve(__dirname),
    path.resolve(__dirname, '../')
  ],
  testMatch: [
    '<rootDir>/plugins/**/__tests__/**/*.[jt]s?(x)'
  ],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  transformIgnorePatterns: [
     'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(modules-core)?|@expo(nent)?|.*react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|llama.rn|@lemonade/core)'
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/../.next',
  ]
};
