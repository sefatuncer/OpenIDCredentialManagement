// Jest setup file
// This file runs before each test file

export {}; // Make this file a module to enable global augmentation

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.API_KEY = 'test-api-key-12345';
process.env.DEMO_CLIENT_SECRET = 'test-demo-secret';

// Increase timeout for async operations
jest.setTimeout(30000);

// Global test utilities
beforeAll(() => {
  // Silence console during tests (optional)
  // jest.spyOn(console, 'log').mockImplementation(() => {});
  // jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // Cleanup after all tests
});

// Custom matchers (optional)
expect.extend({
  toBeValidDid(received: string) {
    const pass = /^did:[a-z0-9]+:.+$/i.test(received);
    return {
      message: () =>
        pass
          ? `expected ${received} not to be a valid DID`
          : `expected ${received} to be a valid DID`,
      pass,
    };
  },
});

// Declare custom matchers for TypeScript
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidDid(): R;
    }
  }
}
