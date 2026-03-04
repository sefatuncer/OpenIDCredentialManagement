// Basit validation - Zod benzeri API ama lightweight

export interface ValidationResult {
  success: boolean;
  error?: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface SchemaResult<T> {
  success: boolean;
  data?: T;
  errors?: FieldError[];
}

// Validators
export const v = {
  required: (value: unknown, message = 'This field is required'): ValidationResult => {
    if (value === null || value === undefined || value === '') {
      return { success: false, error: message };
    }
    return { success: true };
  },

  minLength: (min: number, message?: string) => (value: unknown): ValidationResult => {
    const str = String(value || '');
    if (str.length < min) {
      return { success: false, error: message || `Must be at least ${min} characters` };
    }
    return { success: true };
  },

  maxLength: (max: number, message?: string) => (value: unknown): ValidationResult => {
    const str = String(value || '');
    if (str.length > max) {
      return { success: false, error: message || `Must be at most ${max} characters` };
    }
    return { success: true };
  },

  pattern: (regex: RegExp, message = 'Invalid format') => (value: unknown): ValidationResult => {
    const str = String(value || '');
    if (!regex.test(str)) {
      return { success: false, error: message };
    }
    return { success: true };
  },

  did: (value: unknown): ValidationResult => {
    const str = String(value || '');
    if (!str.startsWith('did:')) {
      return { success: false, error: 'Must be a valid DID (did:method:...)' };
    }
    const parts = str.split(':');
    if (parts.length < 3) {
      return { success: false, error: 'DID format: did:method:identifier' };
    }
    return { success: true };
  },

  email: (value: unknown): ValidationResult => {
    const str = String(value || '');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(str)) {
      return { success: false, error: 'Enter a valid email address' };
    }
    return { success: true };
  },

  url: (value: unknown): ValidationResult => {
    const str = String(value || '');
    try {
      new URL(str);
      return { success: true };
    } catch {
      return { success: false, error: 'Enter a valid URL' };
    }
  },

  oneOf: <T>(options: T[], message?: string) => (value: unknown): ValidationResult => {
    if (!options.includes(value as T)) {
      return { success: false, error: message || `Valid options: ${options.join(', ')}` };
    }
    return { success: true };
  },
};

// Schema builder
type Validator = (value: unknown) => ValidationResult;

interface FieldSchema {
  validators: Validator[];
  optional?: boolean;
}

export function createSchema<T extends Record<string, unknown>>(
  fields: Record<keyof T, FieldSchema>
) {
  return {
    validate(data: Record<string, unknown>): SchemaResult<T> {
      const errors: FieldError[] = [];

      for (const [field, schema] of Object.entries(fields)) {
        const value = data[field];

        // Optional field check
        if (schema.optional && (value === undefined || value === '')) {
          continue;
        }

        // Required check
        if (!schema.optional) {
          const reqResult = v.required(value);
          if (!reqResult.success) {
            errors.push({ field, message: reqResult.error! });
            continue;
          }
        }

        // Run validators
        for (const validator of schema.validators) {
          const result = validator(value);
          if (!result.success) {
            errors.push({ field, message: result.error! });
            break;
          }
        }
      }

      if (errors.length > 0) {
        return { success: false, errors };
      }

      return { success: true, data: data as T };
    },

    validateField(field: string, value: unknown): ValidationResult {
      const schema = fields[field as keyof T];
      if (!schema) {
        return { success: true };
      }

      if (schema.optional && (value === undefined || value === '')) {
        return { success: true };
      }

      if (!schema.optional) {
        const reqResult = v.required(value);
        if (!reqResult.success) {
          return reqResult;
        }
      }

      for (const validator of schema.validators) {
        const result = validator(value);
        if (!result.success) {
          return result;
        }
      }

      return { success: true };
    },
  };
}

// Pre-built schemas
export const schemas = {
  credential: createSchema({
    holderDid: {
      validators: [v.did],
    },
    agentType: {
      validators: [v.oneOf(['assistant', 'autonomous', 'service', 'bot'])],
      optional: true,
    },
    agentName: {
      validators: [v.maxLength(100)],
      optional: true,
    },
  }),

  revocation: createSchema({
    credentialId: {
      validators: [v.minLength(10, 'Credential ID must be at least 10 characters')],
    },
    reason: {
      validators: [v.maxLength(500)],
      optional: true,
    },
  }),

  trustIssuer: createSchema({
    did: {
      validators: [v.did],
    },
    name: {
      validators: [v.maxLength(100)],
      optional: true,
    },
  }),
};
