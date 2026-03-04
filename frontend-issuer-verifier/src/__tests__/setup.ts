import { vi, beforeEach, afterEach } from 'vitest';

// Mock import.meta.env
vi.stubGlobal('import', {
  meta: {
    env: {
      VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
    },
  },
});

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

// Mock fetch
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Mock window.location
const locationMock = {
  href: '',
  origin: 'http://localhost:5174',
  pathname: '/',
  search: '',
  hash: '',
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
};

Object.defineProperty(window, 'location', {
  value: locationMock,
  writable: true,
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorageMock.clear();
  locationMock.href = '';
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Export mocks for use in tests
export { sessionStorageMock, fetchMock, locationMock };
