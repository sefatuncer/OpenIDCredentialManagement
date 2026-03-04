import { batchIssuanceService, BatchCredentialRequest } from '../../src/services/batchIssuance.service'

describe('BatchIssuanceService', () => {
  beforeEach(() => {
    // Reset service state between tests
    batchIssuanceService.configure({
      maxConcurrent: 5,
      batchSize: 10,
      retryAttempts: 2,
      retryDelay: 100,
    })
  })

  describe('createBatchJob', () => {
    it('should create a batch job and return job ID', async () => {
      const requests: BatchCredentialRequest[] = [
        {
          id: 'req-1',
          subjectDid: 'did:key:z6Mk1',
          credentialType: 'TestCredential',
          claims: { name: 'Test 1' },
        },
        {
          id: 'req-2',
          subjectDid: 'did:key:z6Mk2',
          credentialType: 'TestCredential',
          claims: { name: 'Test 2' },
        },
      ]

      const jobId = await batchIssuanceService.createBatchJob(requests)

      expect(jobId).toBeDefined()
      expect(jobId).toMatch(/^batch-/)
    })

    it('should track job status', async () => {
      const requests: BatchCredentialRequest[] = [
        {
          id: 'req-1',
          subjectDid: 'did:key:z6Mk1',
          credentialType: 'TestCredential',
          claims: { name: 'Test' },
        },
      ]

      const jobId = await batchIssuanceService.createBatchJob(requests)
      const status = batchIssuanceService.getJobStatus(jobId)

      expect(status).not.toBeNull()
      expect(status?.totalRequests).toBe(1)
      expect(['pending', 'processing', 'completed']).toContain(status?.status)
    })
  })

  describe('job processing', () => {
    it('should process all requests and update counts', async () => {
      const requests: BatchCredentialRequest[] = Array.from({ length: 5 }, (_, i) => ({
        id: `req-${i}`,
        subjectDid: `did:key:z6Mk${i}`,
        credentialType: 'TestCredential',
        claims: { index: i },
      }))

      const jobId = await batchIssuanceService.createBatchJob(requests)

      // Wait for processing to complete
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const status = batchIssuanceService.getJobStatus(jobId)

      expect(status?.processedCount).toBe(5)
      expect(status?.status).toBe('completed')
    })

    it('should return results for each request', async () => {
      const requests: BatchCredentialRequest[] = [
        {
          id: 'req-1',
          subjectDid: 'did:key:z6Mk1',
          credentialType: 'TestCredential',
          claims: { name: 'Test' },
        },
      ]

      const jobId = await batchIssuanceService.createBatchJob(requests)

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 500))

      const results = batchIssuanceService.getJobResults(jobId)

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('req-1')
      expect(results[0].success).toBe(true)
      expect(results[0].credentialId).toBeDefined()
    })
  })

  describe('job management', () => {
    it('should list all jobs', async () => {
      const requests: BatchCredentialRequest[] = [
        {
          id: 'req-1',
          subjectDid: 'did:key:z6Mk1',
          credentialType: 'TestCredential',
          claims: {},
        },
      ]

      await batchIssuanceService.createBatchJob(requests)
      await batchIssuanceService.createBatchJob(requests)

      const jobs = batchIssuanceService.listJobs()

      expect(jobs.length).toBeGreaterThanOrEqual(2)
    })

    it('should filter jobs by status', async () => {
      const requests: BatchCredentialRequest[] = [
        {
          id: 'req-1',
          subjectDid: 'did:key:z6Mk1',
          credentialType: 'TestCredential',
          claims: {},
        },
      ]

      await batchIssuanceService.createBatchJob(requests)

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 500))

      const completedJobs = batchIssuanceService.listJobs('completed')

      expect(completedJobs.length).toBeGreaterThan(0)
      completedJobs.forEach((job) => {
        expect(job.status).toBe('completed')
      })
    })

    it('should return null for non-existent job', () => {
      const status = batchIssuanceService.getJobStatus('non-existent-job')
      expect(status).toBeNull()
    })
  })

  describe('cancel job', () => {
    it('should cancel a pending job', async () => {
      // Create a large job that takes time
      const requests: BatchCredentialRequest[] = Array.from({ length: 100 }, (_, i) => ({
        id: `req-${i}`,
        subjectDid: `did:key:z6Mk${i}`,
        credentialType: 'TestCredential',
        claims: { index: i },
      }))

      const jobId = await batchIssuanceService.createBatchJob(requests)

      // Cancel immediately
      const cancelled = batchIssuanceService.cancelJob(jobId)

      expect(cancelled).toBe(true)

      const status = batchIssuanceService.getJobStatus(jobId)
      expect(status?.status).toBe('failed')
      expect(status?.error).toBe('Cancelled by user')
    })

    it('should not cancel completed job', async () => {
      const requests: BatchCredentialRequest[] = [
        {
          id: 'req-1',
          subjectDid: 'did:key:z6Mk1',
          credentialType: 'TestCredential',
          claims: {},
        },
      ]

      const jobId = await batchIssuanceService.createBatchJob(requests)

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 500))

      const cancelled = batchIssuanceService.cancelJob(jobId)

      expect(cancelled).toBe(false)
    })
  })

  describe('statistics', () => {
    it('should return correct statistics', async () => {
      const requests: BatchCredentialRequest[] = [
        {
          id: 'req-1',
          subjectDid: 'did:key:z6Mk1',
          credentialType: 'TestCredential',
          claims: {},
        },
      ]

      await batchIssuanceService.createBatchJob(requests)

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 500))

      const stats = batchIssuanceService.getStats()

      expect(stats.totalJobs).toBeGreaterThan(0)
      expect(stats.totalCredentialsIssued).toBeGreaterThan(0)
    })
  })

  describe('custom issuer', () => {
    it('should use custom issuer function', async () => {
      const customCredentialId = 'custom-cred-123'

      batchIssuanceService.setIssuer(async (request) => ({
        credentialId: customCredentialId,
        credential: JSON.stringify({ custom: true, ...request.claims }),
      }))

      const requests: BatchCredentialRequest[] = [
        {
          id: 'req-1',
          subjectDid: 'did:key:z6Mk1',
          credentialType: 'TestCredential',
          claims: { test: true },
        },
      ]

      const jobId = await batchIssuanceService.createBatchJob(requests)

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 500))

      const results = batchIssuanceService.getJobResults(jobId)

      expect(results[0].credentialId).toBe(customCredentialId)

      // Reset issuer
      batchIssuanceService.setIssuer(null as any)
    })
  })
})
