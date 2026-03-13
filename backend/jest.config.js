/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@credo-ts/core$': '<rootDir>/tests/__mocks__/@credo-ts/core.js',
    '^@credo-ts/askar$': '<rootDir>/tests/__mocks__/@credo-ts/askar.js',
    '^@credo-ts/openid4vc$': '<rootDir>/tests/__mocks__/@credo-ts/openid4vc.js',
    '^@credo-ts/didcomm$': '<rootDir>/tests/__mocks__/@credo-ts/didcomm.js',
    '^@credo-ts/node$': '<rootDir>/tests/__mocks__/@credo-ts/node.js',
    '^@openwallet-foundation/askar-nodejs$': '<rootDir>/tests/__mocks__/@openwallet-foundation/askar-nodejs.js',
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  verbose: true,
  testTimeout: 30000,
};
