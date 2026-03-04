/**
 * Advanced Behaviors for Phase 4
 * Adds complex behavior patterns, cooperation, conflict resolution, and learning
 */

import { v4 as uuidv4 } from 'uuid'
import {
  AgentRole,
  AgentGoal,
  GoalType,
  CooperationRequest,
  Conflict,
  LearningMemory,
  BehaviorPattern,
  BehaviorStep,
  ActionType,
  TickResult,
  ActionResult,
} from './types'
import { logger } from '../utils/logger'

// ============== STORAGE ==============

const agentGoals: Map<string, AgentGoal[]> = new Map()
const cooperationRequests: Map<string, CooperationRequest[]> = new Map()
const activeConflicts: Map<string, Conflict> = new Map()
const learningMemories: Map<string, LearningMemory> = new Map()
const behaviorPatterns: Map<string, BehaviorPattern[]> = new Map()

// ============== GOAL MANAGEMENT ==============

export function createGoal(
  agentDid: string,
  type: GoalType,
  target: number,
  priority: number = 5,
  collaborators?: string[]
): AgentGoal {
  const goal: AgentGoal = {
    id: uuidv4(),
    type,
    description: getGoalDescription(type),
    priority,
    progress: 0,
    target,
    current: 0,
    status: 'active',
    collaborators,
    createdAt: new Date(),
  }

  const goals = agentGoals.get(agentDid) || []
  goals.push(goal)
  agentGoals.set(agentDid, goals)

  return goal
}

export function updateGoalProgress(agentDid: string, goalId: string, increment: number): void {
  const goals = agentGoals.get(agentDid) || []
  const goal = goals.find(g => g.id === goalId)

  if (goal && goal.status === 'active') {
    goal.current += increment
    goal.progress = Math.min(100, (goal.current / goal.target) * 100)

    if (goal.current >= goal.target) {
      goal.status = 'completed'
      goal.completedAt = new Date()
    }
  }
}

export function getActiveGoals(agentDid: string): AgentGoal[] {
  return (agentGoals.get(agentDid) || []).filter(g => g.status === 'active')
}

export function getHighestPriorityGoal(agentDid: string): AgentGoal | null {
  const active = getActiveGoals(agentDid)
  if (active.length === 0) return null
  return active.sort((a, b) => b.priority - a.priority)[0]
}

function getGoalDescription(type: GoalType): string {
  switch (type) {
    case 'COLLECT_CREDENTIALS': return 'Collect credentials from issuers'
    case 'VERIFY_AGENTS': return 'Verify presentations from holders'
    case 'ISSUE_TO_ALL': return 'Issue credentials to all known holders'
    case 'BUILD_TRUST_NETWORK': return 'Establish trust with multiple agents'
    case 'BECOME_HUB': return 'Become a central node in the network'
    case 'MAINTAIN_REPUTATION': return 'Maintain reputation above threshold'
    case 'COLLABORATE_ON_TASK': return 'Work with others on shared objective'
  }
}

// ============== COOPERATION SYSTEM ==============

export function requestCooperation(
  requesterDid: string,
  type: CooperationRequest['type'],
  priority: number = 5,
  reward?: string
): CooperationRequest {
  const request: CooperationRequest = {
    id: uuidv4(),
    requester: requesterDid,
    type,
    description: getCooperationDescription(type),
    priority,
    reward,
    status: 'pending',
    createdAt: new Date(),
  }

  const requests = cooperationRequests.get(requesterDid) || []
  requests.push(request)
  cooperationRequests.set(requesterDid, requests)

  return request
}

export function getPendingCooperationRequests(): CooperationRequest[] {
  const allRequests: CooperationRequest[] = []
  cooperationRequests.forEach(requests => {
    allRequests.push(...requests.filter(r => r.status === 'pending'))
  })
  return allRequests.sort((a, b) => b.priority - a.priority)
}

export function acceptCooperation(
  accepterDid: string,
  requestId: string
): boolean {
  for (const [, requests] of cooperationRequests) {
    const request = requests.find(r => r.id === requestId)
    if (request && request.status === 'pending') {
      request.status = 'accepted'
      request.acceptedBy = accepterDid
      return true
    }
  }
  return false
}

export function completeCooperation(requestId: string): boolean {
  for (const [, requests] of cooperationRequests) {
    const request = requests.find(r => r.id === requestId)
    if (request && request.status === 'accepted') {
      request.status = 'completed'
      return true
    }
  }
  return false
}

function getCooperationDescription(type: CooperationRequest['type']): string {
  switch (type) {
    case 'credential_request': return 'Request help obtaining a credential'
    case 'verification_help': return 'Request verification assistance'
    case 'trust_endorsement': return 'Request trust endorsement from trusted agent'
    case 'task_share': return 'Share workload on a common task'
  }
}

// ============== CONFLICT RESOLUTION ==============

export function reportConflict(
  participants: string[],
  type: Conflict['type'],
  description: string
): Conflict {
  const conflict: Conflict = {
    id: uuidv4(),
    type,
    participants,
    description,
    createdAt: new Date(),
  }

  activeConflicts.set(conflict.id, conflict)
  return conflict
}

export function resolveConflict(
  conflictId: string,
  resolution: Conflict['resolution'],
  agentReputations?: Map<string, number>
): string | null {
  const conflict = activeConflicts.get(conflictId)
  if (!conflict) return null

  let winner: string | null = null

  switch (resolution) {
    case 'priority':
      // Higher priority agent wins (based on some external priority)
      winner = conflict.participants[0]
      break

    case 'reputation':
      // Highest reputation wins
      if (agentReputations) {
        let maxRep = -1
        for (const did of conflict.participants) {
          const rep = agentReputations.get(did) || 0
          if (rep > maxRep) {
            maxRep = rep
            winner = did
          }
        }
      }
      break

    case 'random':
      // Random selection
      winner = conflict.participants[Math.floor(Math.random() * conflict.participants.length)]
      break

    case 'negotiation':
      // Both yield partially - no clear winner
      winner = null
      break
  }

  conflict.resolution = resolution
  conflict.winner = winner || undefined
  conflict.resolvedAt = new Date()
  activeConflicts.delete(conflictId)

  return winner
}

export function getActiveConflicts(): Conflict[] {
  return Array.from(activeConflicts.values())
}

// ============== LEARNING & ADAPTATION ==============

export function initializeLearning(agentDid: string): LearningMemory {
  const memory: LearningMemory = {
    actionSuccessRates: new Map(),
    optimalInteractionTimes: new Map(),
    preferences: {
      preferredIssuers: [],
      preferredVerifiers: [],
      avoidAgents: [],
    },
    explorationRate: 0.3,      // 30% exploration initially
    riskTolerance: 0.5,        // Medium risk
    cooperationBias: 0.6,      // Slightly cooperative
  }

  learningMemories.set(agentDid, memory)
  return memory
}

export function getLearningMemory(agentDid: string): LearningMemory | undefined {
  return learningMemories.get(agentDid)
}

export function recordActionOutcome(
  agentDid: string,
  targetDid: string,
  action: ActionType,
  success: boolean
): void {
  let memory = learningMemories.get(agentDid)
  if (!memory) {
    memory = initializeLearning(agentDid)
  }

  let targetRates = memory.actionSuccessRates.get(targetDid)
  if (!targetRates) {
    targetRates = new Map()
    memory.actionSuccessRates.set(targetDid, targetRates)
  }

  const current = targetRates.get(action) || { success: 0, total: 0 }
  current.total++
  if (success) current.success++
  targetRates.set(action, current)

  // Update preferences based on patterns
  const successRate = current.success / current.total

  if (successRate >= 0.8 && current.total >= 5) {
    // Good experience - add to preferred
    if (action === 'ISSUE_CREDENTIAL' && !memory.preferences.preferredIssuers.includes(targetDid)) {
      memory.preferences.preferredIssuers.push(targetDid)
    }
    if (action === 'VERIFY_PRESENTATION' && !memory.preferences.preferredVerifiers.includes(targetDid)) {
      memory.preferences.preferredVerifiers.push(targetDid)
    }
    // Remove from avoid list if there
    memory.preferences.avoidAgents = memory.preferences.avoidAgents.filter(d => d !== targetDid)
  } else if (successRate < 0.3 && current.total >= 3) {
    // Bad experience - add to avoid
    if (!memory.preferences.avoidAgents.includes(targetDid)) {
      memory.preferences.avoidAgents.push(targetDid)
    }
    // Remove from preferred lists
    memory.preferences.preferredIssuers = memory.preferences.preferredIssuers.filter(d => d !== targetDid)
    memory.preferences.preferredVerifiers = memory.preferences.preferredVerifiers.filter(d => d !== targetDid)
  }
}

export function shouldExplore(agentDid: string): boolean {
  const memory = learningMemories.get(agentDid)
  if (!memory) return Math.random() < 0.3
  return Math.random() < memory.explorationRate
}

export function adaptBehavior(agentDid: string): void {
  const memory = learningMemories.get(agentDid)
  if (!memory) return

  // Calculate overall success rate
  let totalSuccess = 0
  let totalActions = 0

  memory.actionSuccessRates.forEach(targetRates => {
    targetRates.forEach(rate => {
      totalSuccess += rate.success
      totalActions += rate.total
    })
  })

  if (totalActions < 10) return // Not enough data

  const overallSuccessRate = totalSuccess / totalActions

  // Adapt exploration rate
  if (overallSuccessRate > 0.7) {
    // Doing well - reduce exploration
    memory.explorationRate = Math.max(0.1, memory.explorationRate - 0.05)
  } else if (overallSuccessRate < 0.4) {
    // Doing poorly - increase exploration
    memory.explorationRate = Math.min(0.5, memory.explorationRate + 0.05)
  }

  // Adapt cooperation bias based on cooperation outcomes
  // (Would need to track cooperation outcomes separately)
}

export function selectBestTarget(
  agentDid: string,
  candidates: string[],
  action: ActionType
): string | null {
  if (candidates.length === 0) return null

  const memory = learningMemories.get(agentDid)
  if (!memory || shouldExplore(agentDid)) {
    // Explore: pick random, but avoid bad agents
    const filtered = candidates.filter(c => !memory?.preferences.avoidAgents.includes(c))
    if (filtered.length === 0) return candidates[Math.floor(Math.random() * candidates.length)]
    return filtered[Math.floor(Math.random() * filtered.length)]
  }

  // Exploit: pick best known target
  let bestTarget: string | null = null
  let bestRate = -1

  for (const candidate of candidates) {
    // Skip avoided agents
    if (memory.preferences.avoidAgents.includes(candidate)) continue

    const targetRates = memory.actionSuccessRates.get(candidate)
    if (targetRates) {
      const actionRate = targetRates.get(action)
      if (actionRate && actionRate.total >= 2) {
        const rate = actionRate.success / actionRate.total
        if (rate > bestRate) {
          bestRate = rate
          bestTarget = candidate
        }
      }
    }
  }

  // If no known good target, pick from preferred or random
  if (!bestTarget) {
    if (action === 'ISSUE_CREDENTIAL' && memory.preferences.preferredIssuers.length > 0) {
      const preferred = candidates.filter(c => memory.preferences.preferredIssuers.includes(c))
      if (preferred.length > 0) {
        bestTarget = preferred[Math.floor(Math.random() * preferred.length)]
      }
    }
    if (action === 'VERIFY_PRESENTATION' && memory.preferences.preferredVerifiers.length > 0) {
      const preferred = candidates.filter(c => memory.preferences.preferredVerifiers.includes(c))
      if (preferred.length > 0) {
        bestTarget = preferred[Math.floor(Math.random() * preferred.length)]
      }
    }
  }

  return bestTarget || candidates[Math.floor(Math.random() * candidates.length)]
}

// ============== BEHAVIOR PATTERNS ==============

export function createBehaviorPattern(
  agentDid: string,
  name: string,
  steps: BehaviorStep[]
): BehaviorPattern {
  const pattern: BehaviorPattern = {
    id: uuidv4(),
    name,
    description: `Multi-step behavior: ${name}`,
    steps,
    currentStep: 0,
    status: 'idle',
  }

  const patterns = behaviorPatterns.get(agentDid) || []
  patterns.push(pattern)
  behaviorPatterns.set(agentDid, patterns)

  return pattern
}

export function startBehaviorPattern(agentDid: string, patternId: string): boolean {
  const patterns = behaviorPatterns.get(agentDid) || []
  const pattern = patterns.find(p => p.id === patternId)

  if (pattern && pattern.status === 'idle') {
    pattern.status = 'running'
    pattern.startedAt = new Date()
    pattern.currentStep = 0
    return true
  }
  return false
}

export function getActiveBehaviorPattern(agentDid: string): BehaviorPattern | null {
  const patterns = behaviorPatterns.get(agentDid) || []
  return patterns.find(p => p.status === 'running') || null
}

export function advanceBehaviorPattern(
  agentDid: string,
  patternId: string,
  success: boolean
): BehaviorStep | null {
  const patterns = behaviorPatterns.get(agentDid) || []
  const pattern = patterns.find(p => p.id === patternId)

  if (!pattern || pattern.status !== 'running') return null

  const currentStep = pattern.steps[pattern.currentStep]

  if (success) {
    switch (currentStep.onSuccess) {
      case 'next':
        pattern.currentStep++
        if (pattern.currentStep >= pattern.steps.length) {
          pattern.status = 'completed'
          pattern.completedAt = new Date()
          return null
        }
        return pattern.steps[pattern.currentStep]

      case 'complete':
        pattern.status = 'completed'
        pattern.completedAt = new Date()
        return null

      case 'repeat':
        return currentStep
    }
  } else {
    currentStep.retryCount++

    switch (currentStep.onFailure) {
      case 'retry':
        if (currentStep.retryCount < currentStep.maxRetries) {
          return currentStep
        }
        pattern.status = 'failed'
        return null

      case 'skip':
        pattern.currentStep++
        if (pattern.currentStep >= pattern.steps.length) {
          pattern.status = 'completed'
          pattern.completedAt = new Date()
          return null
        }
        return pattern.steps[pattern.currentStep]

      case 'abort':
        pattern.status = 'failed'
        return null

      case 'complete':
        pattern.status = 'completed'
        pattern.completedAt = new Date()
        return null
    }
  }

  return null
}

// ============== PREDEFINED PATTERNS ==============

export function getCredentialCollectionPattern(): BehaviorStep[] {
  return [
    {
      action: 'DISCOVER_AGENT',
      targetRole: 'issuer',
      onSuccess: 'next',
      onFailure: 'retry',
      maxRetries: 3,
      retryCount: 0,
    },
    {
      action: 'ESTABLISH_TRUST',
      targetRole: 'issuer',
      onSuccess: 'next',
      onFailure: 'skip',
      maxRetries: 2,
      retryCount: 0,
    },
    {
      action: 'SEND_MESSAGE',
      targetRole: 'issuer',
      params: { subject: 'credential_request' },
      onSuccess: 'next',
      onFailure: 'retry',
      maxRetries: 2,
      retryCount: 0,
    },
    {
      action: 'RECEIVE_MESSAGE',
      onSuccess: 'complete',
      onFailure: 'retry',
      maxRetries: 5,
      retryCount: 0,
    },
  ]
}

export function getVerificationPattern(): BehaviorStep[] {
  return [
    {
      action: 'DISCOVER_AGENT',
      targetRole: 'holder',
      onSuccess: 'next',
      onFailure: 'retry',
      maxRetries: 3,
      retryCount: 0,
    },
    {
      action: 'SEND_MESSAGE',
      targetRole: 'holder',
      params: { subject: 'presentation_request' },
      onSuccess: 'next',
      onFailure: 'retry',
      maxRetries: 2,
      retryCount: 0,
    },
    {
      action: 'VERIFY_PRESENTATION',
      onSuccess: 'next',
      onFailure: 'skip',
      maxRetries: 1,
      retryCount: 0,
    },
    {
      action: 'ESTABLISH_TRUST',
      onSuccess: 'complete',
      onFailure: 'complete',
      maxRetries: 1,
      retryCount: 0,
    },
  ]
}

export function getTrustBuildingPattern(): BehaviorStep[] {
  return [
    {
      action: 'DISCOVER_AGENT',
      onSuccess: 'next',
      onFailure: 'retry',
      maxRetries: 3,
      retryCount: 0,
    },
    {
      action: 'SEND_MESSAGE',
      params: { subject: 'trust_inquiry' },
      onSuccess: 'next',
      onFailure: 'skip',
      maxRetries: 2,
      retryCount: 0,
    },
    {
      action: 'ESTABLISH_TRUST',
      onSuccess: 'next',
      onFailure: 'retry',
      maxRetries: 2,
      retryCount: 0,
    },
    {
      action: 'CREATE_DELEGATION',
      params: { permissions: ['read'] },
      onSuccess: 'complete',
      onFailure: 'complete',
      maxRetries: 1,
      retryCount: 0,
    },
  ]
}

// ============== CLEANUP ==============

export function clearAdvancedBehaviorData(): void {
  agentGoals.clear()
  cooperationRequests.clear()
  activeConflicts.clear()
  learningMemories.clear()
  behaviorPatterns.clear()
}

// ============== STATS ==============

export function getAdvancedStats(agentDid: string): Record<string, unknown> {
  const goals = agentGoals.get(agentDid) || []
  const memory = learningMemories.get(agentDid)
  const patterns = behaviorPatterns.get(agentDid) || []

  return {
    goals: {
      active: goals.filter(g => g.status === 'active').length,
      completed: goals.filter(g => g.status === 'completed').length,
      failed: goals.filter(g => g.status === 'failed').length,
    },
    learning: memory ? {
      explorationRate: memory.explorationRate,
      riskTolerance: memory.riskTolerance,
      cooperationBias: memory.cooperationBias,
      preferredIssuers: memory.preferences.preferredIssuers.length,
      preferredVerifiers: memory.preferences.preferredVerifiers.length,
      avoidedAgents: memory.preferences.avoidAgents.length,
    } : null,
    patterns: {
      total: patterns.length,
      running: patterns.filter(p => p.status === 'running').length,
      completed: patterns.filter(p => p.status === 'completed').length,
    },
  }
}
