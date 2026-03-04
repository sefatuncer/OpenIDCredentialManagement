/**
 * Simulation API Routes
 * Endpoints for controlling the autonomous agent simulation
 */

import { Router, Request, Response } from 'express'
import { simulationEngine } from '../../simulation'
import { SimulationConfig } from '../../simulation/types'
import { logger } from '../../utils/logger'

const router = Router()

/**
 * @swagger
 * tags:
 *   - name: Simulation
 *     description: Autonomous agent simulation control
 */

/**
 * @swagger
 * /api/v1/simulation/start:
 *   post:
 *     summary: Start a new simulation
 *     tags: [Simulation]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               issuerCount:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 10
 *                 default: 2
 *                 description: Number of issuer agents
 *               verifierCount:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 10
 *                 default: 2
 *                 description: Number of verifier agents
 *               holderCount:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 20
 *                 default: 5
 *                 description: Number of holder agents
 *               speed:
 *                 type: string
 *                 enum: [slow, normal, fast]
 *                 default: normal
 *               tickDelay:
 *                 type: number
 *                 description: Custom delay between ticks in ms
 *     responses:
 *       200:
 *         description: Simulation started
 *       400:
 *         description: Invalid configuration
 *       409:
 *         description: Simulation already running
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const config: SimulationConfig = {
      issuerCount: req.body.issuerCount || 2,
      verifierCount: req.body.verifierCount || 2,
      holderCount: req.body.holderCount || 5,
      speed: req.body.speed || 'normal',
      tickDelay: req.body.tickDelay,
      duration: req.body.duration,
    }

    // Validate
    const totalAgents = config.issuerCount + config.verifierCount + config.holderCount
    if (totalAgents < 3 || totalAgents > 30) {
      return res.status(400).json({
        error: 'Invalid agent count',
        message: 'Total agent count must be between 3 and 30',
      })
    }

    if (config.holderCount < 1) {
      return res.status(400).json({
        error: 'Invalid holder count',
        message: 'At least 1 holder is required',
      })
    }

    if (!['slow', 'normal', 'fast'].includes(config.speed)) {
      return res.status(400).json({
        error: 'Invalid speed',
        message: 'Speed must be slow, normal, or fast',
      })
    }

    const result = await simulationEngine.start(config)

    logger.info('Simulation started via API', { sessionId: result.sessionId })

    res.json({
      success: true,
      sessionId: result.sessionId,
      status: result.status,
      message: 'Simulation started',
    })
  } catch (error) {
    if ((error as Error).message === 'Simulation is already running') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A simulation is already running. Stop it first.',
      })
    }

    logger.error('Failed to start simulation', { error })
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * @swagger
 * /api/v1/simulation/stop:
 *   post:
 *     summary: Stop the running simulation
 *     tags: [Simulation]
 *     responses:
 *       200:
 *         description: Simulation stopped
 */
router.post('/stop', (req: Request, res: Response) => {
  try {
    const result = simulationEngine.stop()

    logger.info('Simulation stopped via API')

    res.json({
      success: true,
      status: result.status,
      stats: result.stats,
    })
  } catch (error) {
    logger.error('Failed to stop simulation', { error })
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * @swagger
 * /api/v1/simulation/pause:
 *   post:
 *     summary: Pause the running simulation
 *     tags: [Simulation]
 *     responses:
 *       200:
 *         description: Simulation paused
 */
router.post('/pause', (req: Request, res: Response) => {
  try {
    const status = simulationEngine.pause()
    res.json({ success: true, status })
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * @swagger
 * /api/v1/simulation/resume:
 *   post:
 *     summary: Resume a paused simulation
 *     tags: [Simulation]
 *     responses:
 *       200:
 *         description: Simulation resumed
 */
router.post('/resume', (req: Request, res: Response) => {
  try {
    const status = simulationEngine.resume()
    res.json({ success: true, status })
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * @swagger
 * /api/v1/simulation/status:
 *   get:
 *     summary: Get simulation status
 *     tags: [Simulation]
 *     responses:
 *       200:
 *         description: Current simulation status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const state = simulationEngine.getStatus()
    res.json(state)
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * @swagger
 * /api/v1/simulation/agents:
 *   get:
 *     summary: Get all simulation agents
 *     tags: [Simulation]
 *     responses:
 *       200:
 *         description: List of agents
 */
router.get('/agents', (req: Request, res: Response) => {
  try {
    const agents = simulationEngine.getAgents()
    res.json({ agents, count: agents.length })
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * @swagger
 * /api/v1/simulation/agents/{did}:
 *   get:
 *     summary: Get detailed agent information
 *     tags: [Simulation]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent DID
 *     responses:
 *       200:
 *         description: Detailed agent information
 *       404:
 *         description: Agent not found
 */
router.get('/agents/:did', (req: Request, res: Response) => {
  try {
    const { did } = req.params
    const agentDetails = simulationEngine.getAgentDetails(did)

    if (!agentDetails) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Agent not found',
      })
    }

    res.json(agentDetails)
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * @swagger
 * /api/v1/simulation/events:
 *   get:
 *     summary: Get simulation events
 *     tags: [Simulation]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of events
 */
router.get('/events', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100
    const offset = parseInt(req.query.offset as string) || 0
    const events = simulationEngine.getEvents(limit, offset)
    res.json({ events, count: events.length })
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * @swagger
 * /api/v1/simulation/network:
 *   get:
 *     summary: Get network state (nodes and edges)
 *     tags: [Simulation]
 *     responses:
 *       200:
 *         description: Network state
 */
router.get('/network', (req: Request, res: Response) => {
  try {
    const network = simulationEngine.getNetworkState()
    res.json(network)
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * @swagger
 * /api/v1/simulation/stats:
 *   get:
 *     summary: Get simulation statistics
 *     tags: [Simulation]
 *     responses:
 *       200:
 *         description: Simulation statistics
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = simulationEngine.getStats()
    res.json(stats)
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

export default router
