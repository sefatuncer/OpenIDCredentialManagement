// Vitest setup file
// This file runs before each test file

import { vi, expect } from 'vitest'

export {}; // Make this file a module to enable global augmentation

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.API_KEY = 'test-api-key-12345';
process.env.DEMO_CLIENT_SECRET = 'test-demo-secret';

// Global test utilities
beforeAll(() => {
  // Silence console during tests (optional)
  // vi.spyOn(console, 'log').mockImplementation(() => {});
  // vi.spyOn(console, 'error').mockImplementation(() => {});
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
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeValidDid(): T;
  }
  interface AsymmetricMatchersContaining {
    toBeValidDid(): any;
  }
}
