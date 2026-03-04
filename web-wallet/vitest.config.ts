import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SSI_BACKEND_URL': JSON.stringify('http://localhost:3000'),
    'import.meta.env.VITE_CLIENT_ID': JSON.stringify('test-client-id'),
    'import.meta.env.VITE_CLIENT_SECRET': JSON.stringify('test-client-secret'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/tests/setup.ts'],
    },
  },
})
