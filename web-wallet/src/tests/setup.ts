import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock fetch globally
global.fetch = vi.fn()

// Mock import.meta.env
vi.stubGlobal('import.meta', {
  env: {
    VITE_SSI_BACKEND_URL: 'http://localhost:3000',
  },
})

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})
