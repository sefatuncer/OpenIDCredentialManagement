export interface CredentialOffer {
  credentialOfferId: string
  credentialOfferUri: string
  qrCode?: string
}

export interface CredentialRequest {
  credentialRequestId: string
  holderDid: string
  schemaId: string
  attributes: Record<string, string>
}

export interface VerificationRequest {
  verificationRequestId: string
  requestUri: string
  qrCode?: string
}

export interface VerificationResult {
  verified: boolean
  credentialSubject?: Record<string, any>
  issuerDid?: string
  issuanceDate?: string
  expirationDate?: string
  errors?: string[]
}

export interface PresentationDefinition {
  id: string
  input_descriptors: InputDescriptor[]
}

export interface InputDescriptor {
  id: string
  name: string
  purpose: string
  constraints: {
    fields: FieldConstraint[]
  }
}

export interface FieldConstraint {
  path: string[]
  filter?: {
    type: string
    pattern?: string
    const?: string | number | boolean
  }
}
