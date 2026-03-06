/**
 * Autonomous Agent for Simulation
 * ISOLATED from main system - easy to remove later
 */

import { v4 as uuidv4 } from 'uuid'
import {
  AgentRole,
  AgentState,
  ActionResult,
  TickResult,
  Message,
  TrustRelation,
  Delegation,
  AgentProfile,
  SimulationCredential,
  SimulationPresentation,
  AgentGoal,
  GoalType,
} from './types'
import { logger } from '../utils/logger'
import {
  createGoal,
  updateGoalProgress,
  getActiveGoals,
  getHighestPriorityGoal,
  initializeLearning,
  recordActionOutcome,
  selectBestTarget,
  shouldExplore,
  adaptBehavior,
  getPendingCooperationRequests,
  requestCooperation,
  acceptCooperation,
  completeCooperation,
  getAdvancedStats,
  clearAdvancedBehaviorData,
  getActiveBehaviorPattern,
  createBehaviorPattern,
  startBehaviorPattern,
  advanceBehaviorPattern,
  getCredentialCollectionPattern,
  getVerificationPattern,
  getTrustBuildingPattern,
} from './advanced-behaviors'

// ============== SIMULATION-ONLY STORAGE ==============

// Credentials storage (with revocation support)
const simulationCredentials: Map<string, SimulationCredential[]> = new Map()

// Presentations queue
const simulationPresentations: Map<string, SimulationPresentation[]> = new Map()

// Messages storage
const simulationMessages: Map<string, Message[]> = new Map()

// Trust relationships
const simulationTrust: Map<string, TrustRelation[]> = new Map()

// Delegations
const simulationDelegations: Map<string, Delegation[]> = new Map()

// Agent registry for discovery
const agentRegistry: Map<string, AgentProfile> = new Map()

// Track interactions for trust scoring
const interactionHistory: Map<string, Map<string, { successes: number; failures: number }>> = new Map()

// ============== HELPER FUNCTIONS ==============

function idle(): TickResult {
  return { action: 'IDLE', result: { success: true, message: 'Idle' } }
}

function selectRandomAgent(agents: AutonomousAgent[], excludeDid?: string, role?: AgentRole): AutonomousAgent | null {
  const filtered = agents.filter(a =>
    a.did !== excludeDid &&
    (role ? a.role === role : true) &&
    a.status === 'active'
  )
  if (filtered.length === 0) return null
  return filtered[Math.floor(Math.random() * filtered.length)]
}

function getTrustLevel(score: number): 'low' | 'medium' | 'high' | 'full' {
  if (score >= 90) return 'full'
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

// ============== AUTONOMOUS AGENT CLASS ==============

export class AutonomousAgent {
  public did: string
  public name: string
  public role: AgentRole
  public status: AgentState['status'] = 'active'

  // Credential counters
  private issuedCredentials: number = 0
  private revokedCredentials: number = 0
  private receivedCredentials: number = 0
  private presentationsMade: number = 0
  private verifiedPresentations: number = 0

  // Message counters
  private messagesSent: number = 0
  private messagesReceived: number = 0

  // Trust counters
  private trustGiven: number = 0
  private trustReceived: number = 0

  // Delegation counters
  private delegationsGiven: number = 0
  private delegationsReceived: number = 0

  // Discovery counters
  private discoveredAgents: Set<string> = new Set()
  private discoveredByCount: number = 0

  // State
  private lastAction: string | null = null
  private lastActionTime: Date | null = null

  // Phase 4: Advanced Behaviors
  private goalsInitialized: boolean = false
  private cooperationCount: number = 0
  private conflictsResolved: number = 0
  private adaptationCount: number = 0
  private tickCount: number = 0

  constructor(name: string, role: AgentRole) {
    this.name = name
    this.role = role
    this.did = this.generateDid()

    // Initialize learning memory for this agent
    initializeLearning(this.did)

    // Set initial goals based on role
    this.initializeGoals()

    // Initialize storage for this agent
    simulationCredentials.set(this.did, [])
    simulationPresentations.set(this.did, [])
    simulationMessages.set(this.did, [])
    simulationTrust.set(this.did, [])
    simulationDelegations.set(this.did, [])
    interactionHistory.set(this.did, new Map())

    // Register self in agent registry
    agentRegistry.set(this.did, {
      did: this.did,
      name: this.name,
      role: this.role,
      capabilities: this.getCapabilities(),
      discoveredAt: new Date(),
      lastSeenAt: new Date(),
      reputation: 50, // Base reputation
    })
  }

  private generateDid(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = 'did:key:z6MkSim'
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  private getCapabilities(): string[] {
    switch (this.role) {
      case 'issuer':
        return ['issue_credential', 'revoke_credential', 'delegate_issuance']
      case 'holder':
        return ['hold_credential', 'present_credential', 'request_credential']
      case 'verifier':
        return ['verify_credential', 'verify_presentation', 'request_presentation']
      default:
        return []
    }
  }

  // ============== PHASE 4: GOAL INITIALIZATION ==============

  private initializeGoals(): void {
    if (this.goalsInitialized) return
    this.goalsInitialized = true

    switch (this.role) {
      case 'issuer':
        createGoal(this.did, 'ISSUE_TO_ALL', 10, 7)
        createGoal(this.did, 'BUILD_TRUST_NETWORK', 5, 5)
        break
      case 'holder':
        createGoal(this.did, 'COLLECT_CREDENTIALS', 5, 8)
        createGoal(this.did, 'BUILD_TRUST_NETWORK', 3, 6)
        break
      case 'verifier':
        createGoal(this.did, 'VERIFY_AGENTS', 8, 7)
        createGoal(this.did, 'MAINTAIN_REPUTATION', 80, 9)
        break
    }
  }

  // ============== MAIN TICK METHOD ==============

  /**
   * Execute one action based on role
   */
  async tick(allAgents: AutonomousAgent[]): Promise<TickResult> {
    this.tickCount++

    try {
      // 0. Check for active behavior patterns first (Phase 4)
      const patternResult = await this.behaviorPatternTick(allAgents)
      if (patternResult.action !== 'IDLE') {
        this.updateState(patternResult)
        return patternResult
      }

      // 1. Check incoming messages first
      const messageResult = await this.processIncomingMessages()
      if (messageResult.action !== 'IDLE') {
        this.updateState(messageResult)
        return messageResult
      }

      // 1.5. Check cooperation requests (Phase 4)
      const coopResult = await this.cooperationTick(allAgents)
      if (coopResult.action !== 'IDLE') {
        this.updateState(coopResult)
        return coopResult
      }

      // 2. Randomly choose between main action and social actions
      // This ensures trust, discovery, etc. have a fair chance to run
      const actionChoice = Math.random()
      let result: TickResult

      if (actionChoice < 0.5) {
        // 50% chance: Do main role-specific action
        switch (this.role) {
          case 'issuer':
            result = await this.issuerTick(allAgents)
            if (result.action !== 'IDLE') {
              this.updateState(result)
              this.updateGoalProgress(result)
              return result
            }
            // Issuer can also revoke
            result = await this.revocationTick(allAgents)
            break
          case 'holder':
            result = await this.holderTick(allAgents)
            break
          case 'verifier':
            result = await this.verifierTick(allAgents)
            break
          default:
            result = idle()
        }
        if (result.action !== 'IDLE') {
          this.updateState(result)
          this.updateGoalProgress(result)
          return result
        }
      } else if (actionChoice < 0.7) {
        // 20% chance: Try trust or discovery first
        result = await this.trustTick(allAgents)
        if (result.action !== 'IDLE') {
          this.updateState(result)
          this.updateGoalProgress(result)
          return result
        }

        result = await this.discoveryTick(allAgents)
        if (result.action !== 'IDLE') {
          this.updateState(result)
          return result
        }
      } else if (actionChoice < 0.85) {
        // 15% chance: Try delegation first
        result = await this.delegationTick(allAgents)
        if (result.action !== 'IDLE') {
          this.updateState(result)
          return result
        }
      } else {
        // 15% chance: Try messaging first
        result = await this.messagingTick(allAgents)
        if (result.action !== 'IDLE') {
          this.updateState(result)
          return result
        }
      }

      // 3. Fallback: Try remaining actions if primary choice returned IDLE

      // Role-specific action (if not tried above)
      if (actionChoice >= 0.5) {
        switch (this.role) {
          case 'issuer':
            result = await this.issuerTick(allAgents)
            if (result.action !== 'IDLE') {
              this.updateState(result)
              this.updateGoalProgress(result)
              return result
            }
            result = await this.revocationTick(allAgents)
            break
          case 'holder':
            result = await this.holderTick(allAgents)
            break
          case 'verifier':
            result = await this.verifierTick(allAgents)
            break
          default:
            result = idle()
        }
        if (result.action !== 'IDLE') {
          this.updateState(result)
          this.updateGoalProgress(result)
          return result
        }
      }

      // Discovery
      result = await this.discoveryTick(allAgents)
      if (result.action !== 'IDLE') {
        this.updateState(result)
        return result
      }

      // Trust establishment
      result = await this.trustTick(allAgents)
      if (result.action !== 'IDLE') {
        this.updateState(result)
        this.updateGoalProgress(result)
        return result
      }

      // Delegation
      result = await this.delegationTick(allAgents)
      if (result.action !== 'IDLE') {
        this.updateState(result)
        return result
      }

      // Messaging
      result = await this.messagingTick(allAgents)
      if (result.action !== 'IDLE') {
        this.updateState(result)
        return result
      }

      // 4. Periodic adaptation (Phase 4) - every 20 ticks
      if (this.tickCount % 20 === 0) {
        adaptBehavior(this.did)
        this.adaptationCount++
      }

      return idle()
    } catch (error) {
      return {
        action: 'IDLE',
        result: { success: false, message: (error as Error).message }
      }
    }
  }

  // ============== PHASE 4: BEHAVIOR PATTERN TICK ==============

  private async behaviorPatternTick(allAgents: AutonomousAgent[]): Promise<TickResult> {
    const activePattern = getActiveBehaviorPattern(this.did)
    if (!activePattern) {
      // 10% chance to start a new behavior pattern
      if (Math.random() > 0.9) {
        return this.startNewBehaviorPattern()
      }
      return idle()
    }

    const currentStep = activePattern.steps[activePattern.currentStep]
    if (!currentStep) return idle()

    // Execute current step
    const stepResult = await this.executePatternStep(currentStep, allAgents)

    // Advance pattern based on result
    const nextStep = advanceBehaviorPattern(this.did, activePattern.id, stepResult.result.success)

    return {
      action: currentStep.action,
      result: {
        success: stepResult.result.success,
        message: `Pattern "${activePattern.name}" step ${activePattern.currentStep + 1}: ${stepResult.result.message}`,
        data: {
          patternId: activePattern.id,
          patternName: activePattern.name,
          step: activePattern.currentStep,
          hasNextStep: !!nextStep,
          ...stepResult.result.data as Record<string, unknown>,
        }
      }
    }
  }

  private startNewBehaviorPattern(): TickResult {
    let pattern
    switch (this.role) {
      case 'holder':
        pattern = createBehaviorPattern(this.did, 'Credential Collection', getCredentialCollectionPattern())
        break
      case 'verifier':
        pattern = createBehaviorPattern(this.did, 'Verification Flow', getVerificationPattern())
        break
      case 'issuer':
        pattern = createBehaviorPattern(this.did, 'Trust Building', getTrustBuildingPattern())
        break
      default:
        return idle()
    }

    startBehaviorPattern(this.did, pattern.id)

    return {
      action: 'IDLE',
      result: {
        success: true,
        message: `Started behavior pattern: ${pattern.name}`,
        data: { patternId: pattern.id, patternName: pattern.name }
      }
    }
  }

  private async executePatternStep(step: any, allAgents: AutonomousAgent[]): Promise<TickResult> {
    // Execute the step's action
    switch (step.action) {
      case 'DISCOVER_AGENT':
        return this.discoveryTick(allAgents)
      case 'ESTABLISH_TRUST':
        return this.trustTick(allAgents)
      case 'SEND_MESSAGE':
        return this.messagingTick(allAgents)
      case 'RECEIVE_MESSAGE':
        return this.processIncomingMessages()
      case 'VERIFY_PRESENTATION':
        return this.verifierTick(allAgents)
      case 'CREATE_DELEGATION':
        return this.delegationTick(allAgents)
      default:
        return idle()
    }
  }

  // ============== PHASE 4: COOPERATION TICK ==============

  private async cooperationTick(allAgents: AutonomousAgent[]): Promise<TickResult> {
    // 15% chance to check for cooperation opportunities
    if (Math.random() > 0.15) return idle()

    // Check pending cooperation requests
    const pendingRequests = getPendingCooperationRequests()
    const relevantRequests = pendingRequests.filter(r =>
      r.requester !== this.did &&
      this.canHelpWith(r.type)
    )

    if (relevantRequests.length > 0) {
      // Accept the highest priority request
      const request = relevantRequests[0]
      if (acceptCooperation(this.did, request.id)) {
        this.cooperationCount++

        return {
          action: 'IDLE',
          result: {
            success: true,
            message: `Accepted cooperation request: ${request.description}`,
            data: {
              requestId: request.id,
              requester: request.requester,
              type: request.type,
            }
          }
        }
      }
    }

    // 5% chance to request cooperation
    if (Math.random() < 0.05) {
      const coopType = this.getCooperationType()
      if (coopType) {
        const request = requestCooperation(this.did, coopType, 5)

        return {
          action: 'IDLE',
          result: {
            success: true,
            message: `Requested cooperation: ${request.description}`,
            data: {
              requestId: request.id,
              type: request.type,
            }
          }
        }
      }
    }

    return idle()
  }

  private canHelpWith(type: string): boolean {
    switch (type) {
      case 'credential_request':
        return this.role === 'issuer'
      case 'verification_help':
        return this.role === 'verifier'
      case 'trust_endorsement':
        return this.trustGiven > 0
      case 'task_share':
        return true
      default:
        return false
    }
  }

  private getCooperationType(): 'credential_request' | 'verification_help' | 'trust_endorsement' | 'task_share' | null {
    switch (this.role) {
      case 'holder':
        return 'credential_request'
      case 'issuer':
        return 'trust_endorsement'
      case 'verifier':
        return 'verification_help'
      default:
        return null
    }
  }

  // ============== PHASE 4: GOAL PROGRESS UPDATE ==============

  private updateGoalProgress(result: TickResult): void {
    if (!result.result.success) return

    const activeGoals = getActiveGoals(this.did)

    for (const goal of activeGoals) {
      switch (goal.type) {
        case 'ISSUE_TO_ALL':
          if (result.action === 'ISSUE_CREDENTIAL') {
            updateGoalProgress(this.did, goal.id, 1)
          }
          break
        case 'COLLECT_CREDENTIALS':
          if (result.action === 'RECEIVE_MESSAGE') {
            // Check if it's a credential
            const data = result.result.data as Record<string, unknown>
            if (data?.subject === 'credential_offer') {
              updateGoalProgress(this.did, goal.id, 1)
            }
          }
          break
        case 'VERIFY_AGENTS':
          if (result.action === 'VERIFY_PRESENTATION') {
            updateGoalProgress(this.did, goal.id, 1)
          }
          break
        case 'BUILD_TRUST_NETWORK':
          if (result.action === 'ESTABLISH_TRUST') {
            updateGoalProgress(this.did, goal.id, 1)
          }
          break
        case 'MAINTAIN_REPUTATION':
          // Reputation maintained by successful interactions
          if (result.result.success) {
            updateGoalProgress(this.did, goal.id, 1)
          }
          break
      }
    }
  }

  private updateState(result: TickResult): void {
    this.lastAction = result.action
    this.lastActionTime = new Date()
  }

  // ============== ISSUER TICK ==============

  private async issuerTick(allAgents: AutonomousAgent[]): Promise<TickResult> {
    const holders = allAgents.filter(a => a.role === 'holder' && a.did !== this.did)

    if (holders.length === 0) {
      return idle()
    }

    // 70% chance to issue a credential
    if (Math.random() > 0.3) {
      // Phase 4: Use learning to select best holder
      const holderDids = holders.map(h => h.did)
      const selectedDid = selectBestTarget(this.did, holderDids, 'ISSUE_CREDENTIAL')
      const holder = holders.find(h => h.did === selectedDid) || holders[0]
      const credentialTypes = ['IdentityCredential', 'MembershipCredential', 'LicenseCredential', 'CertificateCredential']
      const credType = credentialTypes[Math.floor(Math.random() * credentialTypes.length)]

      const credential: SimulationCredential = {
        id: `urn:uuid:${uuidv4()}`,
        type: ['VerifiableCredential', credType],
        issuer: this.did,
        holder: holder.did,
        issuanceDate: new Date().toISOString(),
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        credentialSubject: {
          id: holder.did,
          name: holder.name,
          type: credType.replace('Credential', ''),
          attributes: {
            level: Math.floor(Math.random() * 5) + 1,
            score: Math.floor(Math.random() * 100),
          }
        },
        revoked: false,
      }

      // Store in holder's credentials
      const holderCreds = simulationCredentials.get(holder.did) || []
      holderCreds.push(credential)
      simulationCredentials.set(holder.did, holderCreds)
      holder.receivedCredentials++

      this.issuedCredentials++
      this.recordInteraction(holder.did, true)
      // Phase 4: Record for learning
      recordActionOutcome(this.did, holder.did, 'ISSUE_CREDENTIAL', true)

      return {
        action: 'ISSUE_CREDENTIAL',
        result: {
          success: true,
          message: `Issued ${credType} to ${holder.name}`,
          data: { credentialId: credential.id, credentialType: credType, holder: holder.name }
        }
      }
    }

    return idle()
  }

  // ============== HOLDER TICK ==============

  private async holderTick(allAgents: AutonomousAgent[]): Promise<TickResult> {
    const verifiers = allAgents.filter(a => a.role === 'verifier' && a.did !== this.did)
    const myCredentials = (simulationCredentials.get(this.did) || []).filter(c => !c.revoked)

    if (verifiers.length === 0 || myCredentials.length === 0) {
      return idle()
    }

    // 60% chance to present a credential
    if (Math.random() > 0.4) {
      // Phase 4: Use learning to select best verifier
      const verifierDids = verifiers.map(v => v.did)
      const selectedDid = selectBestTarget(this.did, verifierDids, 'PRESENT_CREDENTIAL')
      const verifier = verifiers.find(v => v.did === selectedDid) || verifiers[0]
      const credential = myCredentials[Math.floor(Math.random() * myCredentials.length)]

      const presentation: SimulationPresentation = {
        id: `urn:uuid:${uuidv4()}`,
        type: ['VerifiablePresentation'],
        holder: this.did,
        verifier: verifier.did,
        verifiableCredential: [credential],
        presentedAt: new Date().toISOString()
      }

      // Store presentation for verifier
      const verifierPresentations = simulationPresentations.get(verifier.did) || []
      verifierPresentations.push(presentation)
      simulationPresentations.set(verifier.did, verifierPresentations)

      this.presentationsMade++

      return {
        action: 'PRESENT_CREDENTIAL',
        result: {
          success: true,
          message: `Presented ${credential.type[1]} to ${verifier.name}`,
          data: { presentationId: presentation.id, credentialType: credential.type[1], verifier: verifier.name }
        }
      }
    }

    return idle()
  }

  // ============== VERIFIER TICK ==============

  private async verifierTick(allAgents: AutonomousAgent[]): Promise<TickResult> {
    const pendingPresentations = simulationPresentations.get(this.did) || []

    if (pendingPresentations.length === 0) {
      return idle()
    }

    // Process one presentation
    const presentation = pendingPresentations.shift()!
    simulationPresentations.set(this.did, pendingPresentations)

    // Validate presentation structure
    if (!presentation.verifiableCredential || presentation.verifiableCredential.length === 0) {
      this.verifiedPresentations++
      this.recordInteraction(presentation.holder, false)
      return {
        action: 'VERIFY_PRESENTATION',
        result: {
          success: false,
          message: 'Presentation contains no credentials',
          data: {
            presentationId: presentation.id,
            holder: presentation.holder,
            verified: false,
            reason: 'no_credentials'
          }
        }
      }
    }

    const credential = presentation.verifiableCredential[0]
    const holder = allAgents.find(a => a.did === presentation.holder)

    // Validate credential structure
    if (!credential || !credential.type || credential.type.length < 2) {
      this.verifiedPresentations++
      this.recordInteraction(presentation.holder, false)
      return {
        action: 'VERIFY_PRESENTATION',
        result: {
          success: false,
          message: 'Invalid credential structure',
          data: {
            presentationId: presentation.id,
            holder: holder?.name,
            verified: false,
            reason: 'invalid_credential'
          }
        }
      }
    }

    // Get fresh credential state from storage to check revocation status
    const holderCredentials = simulationCredentials.get(credential.holder) || []
    const currentCredential = holderCredentials.find(c => c.id === credential.id)

    // Check if credential is revoked (use current state from storage)
    const isRevoked = currentCredential?.revoked || credential.revoked
    if (isRevoked) {
      this.verifiedPresentations++
      this.recordInteraction(presentation.holder, false)

      return {
        action: 'VERIFY_PRESENTATION',
        result: {
          success: false,
          message: `Credential ${credential.type[1]} from ${holder?.name || 'unknown'} has been revoked`,
          data: {
            presentationId: presentation.id,
            credentialType: credential.type[1],
            holder: holder?.name,
            verified: false,
            reason: 'revoked'
          }
        }
      }
    }

    // Check credential expiration
    const now = new Date()
    const expirationDate = new Date(credential.expirationDate)
    if (expirationDate < now) {
      this.verifiedPresentations++
      this.recordInteraction(presentation.holder, false)
      return {
        action: 'VERIFY_PRESENTATION',
        result: {
          success: false,
          message: `Credential ${credential.type[1]} from ${holder?.name || 'unknown'} has expired`,
          data: {
            presentationId: presentation.id,
            credentialType: credential.type[1],
            holder: holder?.name,
            verified: false,
            reason: 'expired'
          }
        }
      }
    }

    // Verify issuer exists and is an issuer role
    const issuerAgent = allAgents.find(a => a.did === credential.issuer)
    if (!issuerAgent || issuerAgent.role !== 'issuer') {
      this.verifiedPresentations++
      this.recordInteraction(presentation.holder, false)
      return {
        action: 'VERIFY_PRESENTATION',
        result: {
          success: false,
          message: `Credential issuer ${credential.issuer} is not a valid issuer`,
          data: {
            presentationId: presentation.id,
            credentialType: credential.type[1],
            holder: holder?.name,
            verified: false,
            reason: 'invalid_issuer'
          }
        }
      }
    }

    // All checks passed - verification successful
    const verified = true

    this.verifiedPresentations++
    this.recordInteraction(presentation.holder, verified)
    // Phase 4: Record for learning
    recordActionOutcome(this.did, presentation.holder, 'VERIFY_PRESENTATION', verified)

    return {
      action: 'VERIFY_PRESENTATION',
      result: {
        success: verified,
        message: `Verified ${credential.type[1]} from ${holder?.name || 'unknown'}`,
        data: {
          presentationId: presentation.id,
          credentialType: credential.type[1],
          holder: holder?.name,
          issuer: issuerAgent.name,
          verified
        }
      }
    }
  }

  // ============== REVOCATION TICK ==============

  private async revocationTick(allAgents: AutonomousAgent[]): Promise<TickResult> {
    // Only issuers can revoke
    if (this.role !== 'issuer') return idle()

    // 10% chance to revoke a random credential
    if (Math.random() > 0.1) return idle()

    // Find credentials I issued that aren't revoked
    const myIssuedCredentials: SimulationCredential[] = []
    simulationCredentials.forEach((creds, holderDid) => {
      creds.forEach(cred => {
        if (cred.issuer === this.did && !cred.revoked) {
          myIssuedCredentials.push(cred)
        }
      })
    })

    if (myIssuedCredentials.length === 0) return idle()

    // Revoke random credential
    const toRevoke = myIssuedCredentials[Math.floor(Math.random() * myIssuedCredentials.length)]
    const reasons = ['expired_membership', 'policy_violation', 'user_request', 'security_concern', 'data_correction']
    const reason = reasons[Math.floor(Math.random() * reasons.length)]

    // Mark as revoked in storage
    const holderCreds = simulationCredentials.get(toRevoke.holder) || []
    const credIndex = holderCreds.findIndex(c => c.id === toRevoke.id)
    if (credIndex !== -1) {
      holderCreds[credIndex].revoked = true
      holderCreds[credIndex].revokedAt = new Date()
      holderCreds[credIndex].revocationReason = reason
      simulationCredentials.set(toRevoke.holder, holderCreds)
    }

    this.revokedCredentials++

    // Send notification to holder
    const holder = allAgents.find(a => a.did === toRevoke.holder)
    if (holder) {
      const notification: Message = {
        id: uuidv4(),
        from: this.did,
        to: toRevoke.holder,
        type: 'notification',
        subject: 'credential_revoked',
        content: { credentialId: toRevoke.id, reason },
        timestamp: new Date(),
        read: false,
      }
      const holderMessages = simulationMessages.get(toRevoke.holder) || []
      holderMessages.push(notification)
      simulationMessages.set(toRevoke.holder, holderMessages)
    }

    return {
      action: 'REVOKE_CREDENTIAL',
      result: {
        success: true,
        message: `Revoked credential ${toRevoke.type[1]} from ${holder?.name || toRevoke.holder}`,
        data: {
          credentialId: toRevoke.id,
          credentialType: toRevoke.type[1],
          holder: holder?.name,
          reason
        }
      }
    }
  }

  // ============== MESSAGING TICK ==============

  private async messagingTick(allAgents: AutonomousAgent[]): Promise<TickResult> {
    // 40% chance to send a message
    if (Math.random() > 0.4) return idle()

    // Select random target based on role
    let targetRole: AgentRole | undefined
    let messageSubject: string
    let messageContent: unknown

    switch (this.role) {
      case 'issuer':
        // Issuers send credential offers or revocation notices
        targetRole = 'holder'
        const subjects = ['credential_offer', 'policy_update', 'renewal_reminder']
        messageSubject = subjects[Math.floor(Math.random() * subjects.length)]
        messageContent = { type: messageSubject, timestamp: new Date().toISOString() }
        break
      case 'holder':
        // Holders send credential requests or presentation offers
        const holderTargetRoles: AgentRole[] = ['issuer', 'verifier']
        targetRole = holderTargetRoles[Math.floor(Math.random() * holderTargetRoles.length)]
        const holderSubjects = targetRole === 'issuer'
          ? ['credential_request', 'renewal_request']
          : ['presentation_offer', 'verification_inquiry']
        messageSubject = holderSubjects[Math.floor(Math.random() * holderSubjects.length)]
        messageContent = { type: messageSubject, timestamp: new Date().toISOString() }
        break
      case 'verifier':
        // Verifiers send verification requests or trust inquiries
        targetRole = 'holder'
        const verifierSubjects = ['verification_request', 'trust_inquiry', 'presentation_request']
        messageSubject = verifierSubjects[Math.floor(Math.random() * verifierSubjects.length)]
        messageContent = { type: messageSubject, timestamp: new Date().toISOString() }
        break
      default:
        return idle()
    }

    const target = selectRandomAgent(allAgents, this.did, targetRole)
    if (!target) return idle()

    const message: Message = {
      id: uuidv4(),
      from: this.did,
      to: target.did,
      type: 'request',
      subject: messageSubject,
      content: messageContent,
      timestamp: new Date(),
      read: false,
    }

    // Store message for recipient
    const targetMessages = simulationMessages.get(target.did) || []
    targetMessages.push(message)
    simulationMessages.set(target.did, targetMessages)

    this.messagesSent++

    return {
      action: 'SEND_MESSAGE',
      result: {
        success: true,
        message: `Sent ${messageSubject} to ${target.name}`,
        data: {
          messageId: message.id,
          to: target.name,
          subject: messageSubject
        }
      }
    }
  }

  // ============== PROCESS INCOMING MESSAGES ==============

  private async processIncomingMessages(): Promise<TickResult> {
    const myMessages = simulationMessages.get(this.did) || []
    const unreadMessages = myMessages.filter(m => !m.read)

    if (unreadMessages.length === 0) return idle()

    // Process one unread message
    const message = unreadMessages[0]
    message.read = true
    this.messagesReceived++

    return {
      action: 'RECEIVE_MESSAGE',
      result: {
        success: true,
        message: `Received ${message.subject} from agent`,
        data: {
          messageId: message.id,
          from: message.from,
          subject: message.subject
        }
      }
    }
  }

  // ============== TRUST TICK ==============

  private async trustTick(allAgents: AutonomousAgent[]): Promise<TickResult> {
    // 60% chance to establish/update trust (increased from 30%)
    if (Math.random() > 0.6) return idle()

    // Find agents I've interacted with but not trusted yet
    const myTrusts = simulationTrust.get(this.did) || []
    const trustedDids = new Set(myTrusts.map(t => t.trustee))

    const candidates = allAgents.filter(a =>
      a.did !== this.did &&
      !trustedDids.has(a.did) &&
      this.hasInteractedWith(a.did)
    )

    if (candidates.length === 0) return idle()

    const target = candidates[Math.floor(Math.random() * candidates.length)]
    const score = this.calculateTrustScore(target)
    const level = getTrustLevel(score)

    const reasons = [
      'successful_verifications',
      'valid_credentials',
      'positive_interactions',
      'web_of_trust_recommendation',
      'consistent_behavior'
    ]
    const reason = reasons[Math.floor(Math.random() * reasons.length)]

    const trustRelation: TrustRelation = {
      id: uuidv4(),
      trustor: this.did,
      trustee: target.did,
      level,
      reason,
      establishedAt: new Date(),
      score,
    }

    myTrusts.push(trustRelation)
    simulationTrust.set(this.did, myTrusts)

    this.trustGiven++
    target.trustReceived++

    return {
      action: 'ESTABLISH_TRUST',
      result: {
        success: true,
        message: `Established ${level} trust with ${target.name}`,
        data: {
          trustId: trustRelation.id,
          trustee: target.name,
          level,
          score,
          reason
        }
      }
    }
  }

  private calculateTrustScore(target: AutonomousAgent): number {
    let score = 50 // base score

    const interactions = interactionHistory.get(this.did)?.get(target.did)
    if (interactions) {
      // Successful interactions increase trust
      score += interactions.successes * 5
      // Failed interactions decrease trust
      score -= interactions.failures * 10
    }

    // Has credential from trusted issuer
    if (this.hasCredentialFrom(target.did)) {
      score += 20
    }

    // Web of Trust bonus: trusted by someone I trust
    const myTrusts = simulationTrust.get(this.did) || []
    for (const trust of myTrusts) {
      const theirTrusts = simulationTrust.get(trust.trustee) || []
      if (theirTrusts.some(t => t.trustee === target.did)) {
        score += 10 // Web of Trust bonus
        break
      }
    }

    return Math.min(100, Math.max(0, score))
  }

  private hasInteractedWith(targetDid: string): boolean {
    const interactions = interactionHistory.get(this.did)?.get(targetDid)
    return interactions !== undefined && (interactions.successes > 0 || interactions.failures > 0)
  }

  private hasCredentialFrom(issuerDid: string): boolean {
    const myCredentials = simulationCredentials.get(this.did) || []
    return myCredentials.some(c => c.issuer === issuerDid && !c.revoked)
  }

  private recordInteraction(targetDid: string, success: boolean): void {
    const myInteractions = interactionHistory.get(this.did) || new Map()
    const targetInteraction = myInteractions.get(targetDid) || { successes: 0, failures: 0 }

    if (success) {
      targetInteraction.successes++
    } else {
      targetInteraction.failures++
    }

    myInteractions.set(targetDid, targetInteraction)
    interactionHistory.set(this.did, myInteractions)
  }

  // ============== DELEGATION TICK ==============

  private async delegationTick(allAgents: AutonomousAgent[]): Promise<TickResult> {
    // 20% chance to create delegation
    if (Math.random() > 0.2) return idle()

    // Find trusted agents to delegate to
    const myTrusts = simulationTrust.get(this.did) || []
    const trustedAgents = allAgents.filter(a =>
      myTrusts.some(t => t.trustee === a.did && t.score >= 70)
    )

    if (trustedAgents.length === 0) return idle()

    const target = trustedAgents[Math.floor(Math.random() * trustedAgents.length)]

    // Select permissions based on role
    const allPermissions = ['read', 'write', 'verify', 'issue', 'revoke', 'delegate']
    const numPermissions = Math.floor(Math.random() * 3) + 1
    const permissions: string[] = []
    for (let i = 0; i < numPermissions; i++) {
      const perm = allPermissions[Math.floor(Math.random() * allPermissions.length)]
      if (!permissions.includes(perm)) {
        permissions.push(perm)
      }
    }

    const delegation: Delegation = {
      id: uuidv4(),
      delegator: this.did,
      delegate: target.did,
      permissions,
      chainDepth: 0,
      createdAt: new Date(),
      revoked: false,
    }

    const myDelegations = simulationDelegations.get(this.did) || []
    myDelegations.push(delegation)
    simulationDelegations.set(this.did, myDelegations)

    this.delegationsGiven++
    target.delegationsReceived++

    return {
      action: 'CREATE_DELEGATION',
      result: {
        success: true,
        message: `Delegated [${permissions.join(', ')}] to ${target.name}`,
        data: {
          delegationId: delegation.id,
          delegate: target.name,
          permissions
        }
      }
    }
  }

  // ============== DISCOVERY TICK ==============

  private async discoveryTick(allAgents: AutonomousAgent[]): Promise<TickResult> {
    // 25% chance to discover
    if (Math.random() > 0.25) return idle()

    // Find agents I haven't discovered yet
    const unknownAgents = allAgents.filter(a =>
      a.did !== this.did &&
      !this.discoveredAgents.has(a.did)
    )

    if (unknownAgents.length === 0) return idle()

    const target = unknownAgents[Math.floor(Math.random() * unknownAgents.length)]

    // Register discovery
    this.discoveredAgents.add(target.did)
    target.discoveredByCount++

    // Update agent registry
    const profile = agentRegistry.get(target.did)
    if (profile) {
      profile.lastSeenAt = new Date()
    }

    return {
      action: 'DISCOVER_AGENT',
      result: {
        success: true,
        message: `Discovered ${target.name} (${target.role})`,
        data: {
          discoveredDid: target.did,
          name: target.name,
          role: target.role,
          capabilities: target.getCapabilities()
        }
      }
    }
  }

  // ============== GET STATE ==============

  getState(): AgentState {
    const myMessages = simulationMessages.get(this.did) || []
    const unreadCount = myMessages.filter(m => !m.read).length
    const myTrusts = simulationTrust.get(this.did) || []
    const trustedByMe = myTrusts.map(t => t.trustee)

    // Count how many trust me
    let trustedByCount = 0
    simulationTrust.forEach(trusts => {
      if (trusts.some(t => t.trustee === this.did)) {
        trustedByCount++
      }
    })

    // Count active delegations
    const myDelegations = simulationDelegations.get(this.did) || []
    const activeDelegations = myDelegations.filter(d => !d.revoked).length

    return {
      did: this.did,
      name: this.name,
      role: this.role,
      status: this.status,
      hasBasicCredential: (simulationCredentials.get(this.did) || []).length > 0,
      hasRichCredential: false,
      lastAction: this.lastAction,
      lastActionTime: this.lastActionTime,

      // Updated counters
      credentialsIssued: this.issuedCredentials,
      credentialsReceived: this.receivedCredentials,
      credentialsRevoked: this.revokedCredentials,
      presentationsMade: this.presentationsMade,
      verificationsPerformed: this.verifiedPresentations,

      // Legacy compatibility
      delegationsGiven: this.delegationsGiven,
      delegationsReceived: this.delegationsReceived,
      trustedAgents: trustedByMe,

      // New - Messaging
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      unreadMessages: unreadCount,

      // New - Trust
      trustRelationships: this.trustGiven,
      trustedBy: trustedByCount,
      trustScore: this.calculateMyTrustScore(),

      // New - Delegation
      activeDelegations,

      // New - Discovery
      discoveredAgents: this.discoveredAgents.size,
      discoveredBy: this.discoveredByCount,
    }
  }

  private calculateMyTrustScore(): number {
    let totalScore = 50 // Base score
    let scoreCount = 1

    // Average of scores given to me by others
    simulationTrust.forEach(trusts => {
      const trustToMe = trusts.find(t => t.trustee === this.did)
      if (trustToMe) {
        totalScore += trustToMe.score
        scoreCount++
      }
    })

    return Math.round(totalScore / scoreCount)
  }

  /**
   * Get detailed agent info for UI display
   */
  getDetailedInfo(): Record<string, unknown> {
    const state = this.getState()
    const myCredentials = simulationCredentials.get(this.did) || []
    const myMessages = simulationMessages.get(this.did) || []
    const myTrusts = simulationTrust.get(this.did) || []
    const myDelegations = simulationDelegations.get(this.did) || []

    // Phase 4: Get advanced behavior stats
    const advancedStats = getAdvancedStats(this.did)
    const activeGoals = getActiveGoals(this.did)

    return {
      ...state,
      credentials: myCredentials.map(c => ({
        id: c.id,
        type: c.type[1],
        issuer: c.issuer,
        issuanceDate: c.issuanceDate,
        revoked: c.revoked,
        revokedAt: c.revokedAt,
        revocationReason: c.revocationReason,
      })),
      recentMessages: myMessages.slice(0, 10).map(m => ({
        id: m.id,
        from: m.from,
        subject: m.subject,
        type: m.type,
        timestamp: m.timestamp,
        read: m.read,
      })),
      trustRelations: myTrusts.map(t => ({
        id: t.id,
        trustee: t.trustee,
        level: t.level,
        score: t.score,
        reason: t.reason,
        establishedAt: t.establishedAt,
      })),
      delegations: myDelegations.map(d => ({
        id: d.id,
        delegate: d.delegate,
        permissions: d.permissions,
        revoked: d.revoked,
        createdAt: d.createdAt,
      })),
      discoveredAgentsList: Array.from(this.discoveredAgents),
      capabilities: this.getCapabilities(),
      // Phase 4: Advanced behavior info
      advanced: {
        ...advancedStats,
        activeGoals: activeGoals.map(g => ({
          id: g.id,
          type: g.type,
          description: g.description,
          progress: g.progress,
          priority: g.priority,
        })),
        cooperationCount: this.cooperationCount,
        conflictsResolved: this.conflictsResolved,
        adaptationCount: this.adaptationCount,
        tickCount: this.tickCount,
      },
    }
  }

  /**
   * Get stats based on role
   */
  getStats(): Record<string, number> {
    const base = {
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      trustGiven: this.trustGiven,
      trustReceived: this.trustReceived,
      delegationsGiven: this.delegationsGiven,
      delegationsReceived: this.delegationsReceived,
      discoveredAgents: this.discoveredAgents.size,
    }

    switch (this.role) {
      case 'issuer':
        return {
          ...base,
          issuedCredentials: this.issuedCredentials,
          revokedCredentials: this.revokedCredentials,
        }
      case 'holder':
        return {
          ...base,
          receivedCredentials: this.receivedCredentials,
          storedCredentials: (simulationCredentials.get(this.did) || []).filter(c => !c.revoked).length,
          presentationsMade: this.presentationsMade,
        }
      case 'verifier':
        return {
          ...base,
          verifiedPresentations: this.verifiedPresentations,
        }
      default:
        return base
    }
  }

  /**
   * Terminate agent
   */
  terminate(): void {
    this.status = 'terminated'
    simulationCredentials.delete(this.did)
    simulationPresentations.delete(this.did)
    simulationMessages.delete(this.did)
    simulationTrust.delete(this.did)
    simulationDelegations.delete(this.did)
    interactionHistory.delete(this.did)
    agentRegistry.delete(this.did)
  }
}

/**
 * Clear all simulation data
 */
export function clearSimulationData(): void {
  simulationCredentials.clear()
  simulationPresentations.clear()
  simulationMessages.clear()
  simulationTrust.clear()
  simulationDelegations.clear()
  interactionHistory.clear()
  agentRegistry.clear()
  // Clear Phase 4 data
  clearAdvancedBehaviorData()
}

/**
 * Get agent registry (for discovery features)
 */
export function getAgentRegistry(): Map<string, AgentProfile> {
  return agentRegistry
}

/**
 * Get all trust relationships (for network visualization)
 */
export function getAllTrustRelations(): TrustRelation[] {
  const allTrusts: TrustRelation[] = []
  simulationTrust.forEach(trusts => {
    allTrusts.push(...trusts)
  })
  return allTrusts
}

/**
 * Get all delegations (for network visualization)
 */
export function getAllDelegations(): Delegation[] {
  const allDelegations: Delegation[] = []
  simulationDelegations.forEach(delegations => {
    allDelegations.push(...delegations)
  })
  return allDelegations
}

/**
 * Get all messages (for monitoring)
 */
export function getAllMessages(): Message[] {
  const allMessages: Message[] = []
  simulationMessages.forEach(messages => {
    allMessages.push(...messages)
  })
  return allMessages
}
