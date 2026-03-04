import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import { Express } from 'express'

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'AI Agent Identity System API',
      version: '1.0.0',
      description: `
API for AI Agent Identity System using Credo SSI Framework.

This API enables:
- **Issuing** verifiable credentials for AI agents
- **Holding** and managing credentials
- **Verifying** credential presentations

## Authentication

The API supports two authentication methods:
- **JWT Bearer Token**: Include \`Authorization: Bearer <token>\` header
- **API Key**: Include \`X-API-Key: <key>\` header

## Rate Limiting

Rate limits are applied per API key or IP address:
- General endpoints: 100 requests/minute
- Credential issuance: 30 requests/minute
- Verification: 50 requests/minute
      `,
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: '/api/v1',
        description: 'API v1',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT authentication token',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'A URI reference that identifies the problem type',
              example: 'https://api.example.com/problems/validation-error',
            },
            title: {
              type: 'string',
              description: 'A short, human-readable summary of the problem type',
              example: 'Validation Error',
            },
            status: {
              type: 'integer',
              description: 'The HTTP status code',
              example: 400,
            },
            detail: {
              type: 'string',
              description: 'A human-readable explanation specific to this occurrence',
              example: 'Request body validation failed',
            },
            instance: {
              type: 'string',
              description: 'A URI reference that identifies the specific occurrence',
              example: '/api/v1/issuer/credentials/agent-identity',
            },
            requestId: {
              type: 'string',
              description: 'Unique identifier for the request',
              example: '550e8400-e29b-41d4-a716-446655440000',
            },
          },
          required: ['type', 'title', 'status'],
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'healthy',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
            uptime: {
              type: 'number',
              description: 'Server uptime in seconds',
            },
          },
        },
        DIDResponse: {
          type: 'object',
          properties: {
            did: {
              type: 'string',
              example: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            },
          },
        },
        AgentIdentityCredentialRequest: {
          type: 'object',
          required: ['holderDid', 'agentId', 'agentType', 'ownerDid'],
          properties: {
            holderDid: {
              type: 'string',
              description: 'DID of the credential holder',
              example: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            },
            agentId: {
              type: 'string',
              description: 'Unique identifier for the agent',
              example: 'agent-001',
            },
            agentType: {
              type: 'string',
              enum: ['autonomous', 'semi-autonomous', 'supervised', 'tool'],
              description: 'Type of AI agent',
            },
            agentName: {
              type: 'string',
              description: 'Human-readable name for the agent',
              example: 'CustomerServiceBot',
            },
            agentVersion: {
              type: 'string',
              description: 'Version of the agent',
              example: '1.0.0',
            },
            capabilities: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'List of agent capabilities',
              example: ['text-generation', 'code-execution'],
            },
            ownerDid: {
              type: 'string',
              description: 'DID of the agent owner',
            },
            ownerName: {
              type: 'string',
              description: 'Name of the agent owner',
            },
            trustLevel: {
              type: 'string',
              enum: ['basic', 'standard', 'elevated', 'high'],
              description: 'Trust level assigned to the agent',
            },
            validUntil: {
              type: 'string',
              format: 'date-time',
              description: 'Expiration date of the credential',
            },
          },
        },
        DelegationCredentialRequest: {
          type: 'object',
          required: ['holderDid', 'delegatorDid', 'delegateDid', 'scope'],
          properties: {
            holderDid: {
              type: 'string',
              description: 'DID of the credential holder',
            },
            delegatorDid: {
              type: 'string',
              description: 'DID of the entity granting delegation',
            },
            delegatorName: {
              type: 'string',
              description: 'Name of the delegator',
            },
            delegateDid: {
              type: 'string',
              description: 'DID of the entity receiving delegation',
            },
            delegateName: {
              type: 'string',
              description: 'Name of the delegate',
            },
            scope: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Scope of the delegation',
              example: ['read:documents', 'write:reports'],
            },
            constraints: {
              type: 'object',
              description: 'Constraints on the delegation',
            },
            purpose: {
              type: 'string',
              description: 'Purpose of the delegation',
            },
            validFrom: {
              type: 'string',
              format: 'date-time',
            },
            validUntil: {
              type: 'string',
              format: 'date-time',
            },
            revocable: {
              type: 'boolean',
              default: true,
            },
          },
        },
        CapabilityCredentialRequest: {
          type: 'object',
          required: ['holderDid', 'capabilityType', 'resource', 'actions'],
          properties: {
            holderDid: {
              type: 'string',
              description: 'DID of the credential holder',
            },
            capabilityType: {
              type: 'string',
              description: 'Type of capability',
              example: 'api-access',
            },
            resource: {
              type: 'string',
              description: 'Resource the capability applies to',
              example: '/api/documents/*',
            },
            actions: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Allowed actions',
              example: ['read', 'write', 'delete'],
            },
            conditions: {
              type: 'object',
              description: 'Conditions for the capability',
            },
            grantedBy: {
              type: 'string',
              description: 'DID of the entity granting the capability',
            },
            validUntil: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        CredentialOfferResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            credentialOfferId: {
              type: 'string',
              description: 'Unique identifier for the credential offer',
            },
            credentialOfferUri: {
              type: 'string',
              description: 'URI for the credential offer (OpenID4VCI)',
            },
          },
        },
        CredentialReceiveRequest: {
          type: 'object',
          required: ['credentialOfferUri'],
          properties: {
            credentialOfferUri: {
              type: 'string',
              description: 'URI of the credential offer to receive',
            },
          },
        },
        CredentialPresentRequest: {
          type: 'object',
          required: ['verificationRequestUri'],
          properties: {
            verificationRequestUri: {
              type: 'string',
              description: 'URI of the verification request',
            },
          },
        },
        VerificationRequestResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            requestUri: {
              type: 'string',
              description: 'URI for the verification request (OpenID4VP)',
            },
            verificationSessionId: {
              type: 'string',
              description: 'Session ID for tracking verification',
            },
          },
        },
        StoredCredential: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            type: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            issuanceDate: {
              type: 'string',
              format: 'date-time',
            },
            expirationDate: {
              type: 'string',
              format: 'date-time',
            },
            credentialSubject: {
              type: 'object',
            },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        Forbidden: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        RateLimitExceeded: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ValidationError: {
          description: 'Request validation failed',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/Error' },
                  {
                    type: 'object',
                    properties: {
                      errors: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            path: { type: 'string' },
                            message: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
    security: [
      { bearerAuth: [] },
      { apiKeyAuth: [] },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
      {
        name: 'Issuer',
        description: 'Credential issuance endpoints',
      },
      {
        name: 'Holder',
        description: 'Credential holder (wallet) endpoints',
      },
      {
        name: 'Verifier',
        description: 'Credential verification endpoints',
      },
      {
        name: 'Agents',
        description: 'AI Agent registration and management endpoints',
      },
      {
        name: 'Wallet',
        description: 'Agent wallet and credential management endpoints',
      },
      {
        name: 'Delegations',
        description: 'Delegation grants between agents',
      },
      {
        name: 'Agent Trust',
        description: 'Trust relationships between AI agents',
      },
      {
        name: 'Simulation',
        description: 'Autonomous agent simulation control and monitoring',
      },
    ],
  },
  apis: ['./src/api/routes/*.ts'],
}

export const swaggerSpec = swaggerJsdoc(options)

export function setupSwagger(app: Express, basePath: string = '/api/v1'): void {
  // Serve swagger UI
  app.use(
    `${basePath}/docs`,
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'AI Agent Identity API Documentation',
    })
  )

  // Serve OpenAPI spec as JSON
  app.get(`${basePath}/docs/openapi.json`, (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(swaggerSpec)
  })
}
