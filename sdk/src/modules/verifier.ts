import type { HttpClient } from '../http'
import type { DIDInfo, VerificationRequest, VerificationResult } from '../types'

export class VerifierClient {
  constructor(private http: HttpClient) {}

  /** Get verifier DID */
  async getDid(): Promise<DIDInfo> {
    return this.http.get('/api/v1/verifier/did')
  }

  /** Create agent identity verification request */
  async verifyAgentIdentity(): Promise<VerificationRequest> {
    return this.http.post('/api/v1/verifier/verify/agent-identity', {})
  }

  /** Create delegation verification request */
  async verifyDelegation(): Promise<VerificationRequest> {
    return this.http.post('/api/v1/verifier/verify/delegation', {})
  }

  /** Create combined verification request (identity + delegation) */
  async verifyCombined(): Promise<VerificationRequest> {
    return this.http.post('/api/v1/verifier/verify/combined', {})
  }

  /** Get verification session result */
  async getResult(sessionId: string): Promise<VerificationResult> {
    return this.http.get(`/api/v1/verifier/verify/${sessionId}/result`)
  }

  /**
   * Poll for verification result until complete or timeout.
   * @param sessionId Session to poll
   * @param intervalMs Polling interval (default: 2000ms)
   * @param timeoutMs Maximum wait time (default: 120000ms)
   */
  async waitForResult(
    sessionId: string,
    intervalMs = 2000,
    timeoutMs = 120000,
  ): Promise<VerificationResult> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const result = await this.getResult(sessionId)
      if (result.status !== 'pending') return result
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    return { status: 'expired' }
  }
}
