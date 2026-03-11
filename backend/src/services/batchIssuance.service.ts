/**
 * Batch Credential Issuance Service
 *
 * Optimizes issuance of multiple credentials in parallel
 */

import { logger } from '../utils/logger'
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'

export interface BatchCredentialRequest {
  id: string
  subjectDid: string
  credentialType: string
  claims: Record<string, any>
  expiresIn?: number
}

export interface BatchCredentialResult {
  id: string
  success: boolean
  credentialId?: string
  credential?: string
  error?: string
}

export interface BatchJob {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  totalRequests: number
  processedCount: number
  successCount: number
  failureCount: number
  results: BatchCredentialResult[]
  startedAt?: Date
  completedAt?: Date
  error?: string
}

interface BatchConfig {
  maxConcurrent: number
  batchSize: number
  retryAttempts: number
  retryDelay: number // ms
}

type CredentialIssuer = (request: BatchCredentialRequest) => Promise<{ credentialId: string; credential: string }>

class BatchIssuanceService {
  private jobsStorage: IStorageAdapter<BatchJob> | null = null
  private config: BatchConfig = {
    maxConcurrent: 10,
    batchSize: 50,
    retryAttempts: 3,
    retryDelay: 1000,
  }
  private issuer: CredentialIssuer | null = null

  private getJobsStorage(): IStorageAdapter<BatchJob> {
    if (!this.jobsStorage) {
      this.jobsStorage = createStorageAdapter<BatchJob>('batch_jobs')
      logger.info('Batch jobs storage initialized', { type: getStorageType() })
    }
    return this.jobsStorage
  }

  configure(config: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...config }
  }

  setIssuer(issuer: CredentialIssuer): void {
    this.issuer = issuer
  }

  /**
   * Create a batch issuance job
   */
  async createBatchJob(requests: BatchCredentialRequest[]): Promise<string> {
    const jobId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

    const job: BatchJob = {
      jobId,
      status: 'pending',
      totalRequests: requests.length,
      processedCount: 0,
      successCount: 0,
      failureCount: 0,
      results: [],
    }

    await this.getJobsStorage().save(jobId, job)
    logger.info(`Batch job created: ${jobId} with ${requests.length} requests`)

    // Start processing in background
    this.processJob(jobId, requests).catch(async (err) => {
      logger.error(`Batch job ${jobId} failed:`, err)
      const j = await this.getJobsStorage().get(jobId)
      if (j) {
        j.status = 'failed'
        j.error = err.message
        j.completedAt = new Date()
        await this.getJobsStorage().save(jobId, j)
      }
    })

    return jobId
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<BatchJob | null> {
    return this.getJobsStorage().get(jobId)
  }

  /**
   * Get job results
   */
  async getJobResults(jobId: string): Promise<BatchCredentialResult[]> {
    const job = await this.getJobsStorage().get(jobId)
    return job?.results || []
  }

  /**
   * Cancel a pending or processing job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.getJobsStorage().get(jobId)
    if (!job || job.status === 'completed' || job.status === 'failed') {
      return false
    }

    job.status = 'failed'
    job.error = 'Cancelled by user'
    job.completedAt = new Date()
    await this.getJobsStorage().save(jobId, job)
    return true
  }

  /**
   * List all jobs
   */
  async listJobs(status?: BatchJob['status']): Promise<BatchJob[]> {
    const jobs = await this.getJobsStorage().list()
    if (status) {
      return jobs.filter((j) => j.status === status)
    }
    return jobs
  }

  /**
   * Clean up completed jobs older than specified age
   */
  async cleanupJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const threshold = Date.now() - maxAgeMs
    let cleaned = 0

    const jobs = await this.getJobsStorage().list()
    for (const job of jobs) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        new Date(job.completedAt).getTime() < threshold
      ) {
        await this.getJobsStorage().delete(job.jobId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old batch jobs`)
    }
    return cleaned
  }

  private async processJob(jobId: string, requests: BatchCredentialRequest[]): Promise<void> {
    const job = await this.getJobsStorage().get(jobId)
    if (!job) return

    job.status = 'processing'
    job.startedAt = new Date()
    await this.getJobsStorage().save(jobId, job)

    // Process in batches
    for (let i = 0; i < requests.length; i += this.config.batchSize) {
      // Check if job was cancelled
      const currentJob = await this.getJobsStorage().get(jobId)
      if (!currentJob || currentJob.status === 'failed') {
        break
      }

      const batch = requests.slice(i, i + this.config.batchSize)
      const results = await this.processBatch(batch)

      for (const result of results) {
        job.results.push(result)
        job.processedCount++

        if (result.success) {
          job.successCount++
        } else {
          job.failureCount++
        }
      }

      // Save progress after each chunk
      await this.getJobsStorage().save(jobId, job)
      logger.debug(`Batch job ${jobId}: processed ${job.processedCount}/${job.totalRequests}`)
    }

    // Re-read to check cancellation
    const finalJob = await this.getJobsStorage().get(jobId)
    if (finalJob && finalJob.status !== 'failed') {
      finalJob.status = 'completed'
      finalJob.completedAt = new Date()
      await this.getJobsStorage().save(jobId, finalJob)
    }

    logger.info(
      `Batch job ${jobId} completed: ${job.successCount} success, ${job.failureCount} failed`
    )
  }

  private async processBatch(requests: BatchCredentialRequest[]): Promise<BatchCredentialResult[]> {
    // Process requests with concurrency limit
    const results: BatchCredentialResult[] = []
    const chunks = this.chunkArray(requests, this.config.maxConcurrent)

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((req) => this.issueWithRetry(req))
      )
      results.push(...chunkResults)
    }

    return results
  }

  private async issueWithRetry(request: BatchCredentialRequest): Promise<BatchCredentialResult> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const result = await this.issueCredential(request)
        return {
          id: request.id,
          success: true,
          credentialId: result.credentialId,
          credential: result.credential,
        }
      } catch (error) {
        lastError = error as Error
        logger.warn(`Attempt ${attempt} failed for ${request.id}: ${lastError.message}`)

        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempt)
        }
      }
    }

    return {
      id: request.id,
      success: false,
      error: lastError?.message || 'Unknown error',
    }
  }

  private async issueCredential(
    request: BatchCredentialRequest
  ): Promise<{ credentialId: string; credential: string }> {
    if (this.issuer) {
      return this.issuer(request)
    }

    // Mock implementation for testing
    await this.delay(100) // Simulate async operation

    const credentialId = `cred-${request.id}-${Date.now()}`
    const credential = JSON.stringify({
      id: credentialId,
      type: request.credentialType,
      subject: request.subjectDid,
      claims: request.claims,
      issuedAt: new Date().toISOString(),
    })

    return { credentialId, credential }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalJobs: number
    pendingJobs: number
    processingJobs: number
    completedJobs: number
    failedJobs: number
    totalCredentialsIssued: number
  }> {
    const jobs = await this.getJobsStorage().list()

    return {
      totalJobs: jobs.length,
      pendingJobs: jobs.filter((j) => j.status === 'pending').length,
      processingJobs: jobs.filter((j) => j.status === 'processing').length,
      completedJobs: jobs.filter((j) => j.status === 'completed').length,
      failedJobs: jobs.filter((j) => j.status === 'failed').length,
      totalCredentialsIssued: jobs.reduce((sum, j) => sum + j.successCount, 0),
    }
  }
}

export const batchIssuanceService = new BatchIssuanceService()
