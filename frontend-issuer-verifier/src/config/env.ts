export const env = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // 5 dakika (ms)
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 dakika (ms)
  APP_NAME: 'SSI Dashboard',
} as const;
