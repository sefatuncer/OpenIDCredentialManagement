// Mock @credo-ts/core for Jest (ESM/CJS incompatibility workaround)
module.exports = {
  Agent: class Agent {
    constructor() {}
    initialize() { return Promise.resolve() }
    shutdown() { return Promise.resolve() }
  },
  InitConfig: {},
  DidsModule: class DidsModule { constructor() {} },
  KeyType: { Ed25519: 'Ed25519' },
  TypedArrayEncoder: { toBase58: () => '', fromBase58: () => new Uint8Array() },
  CredoError: class CredoError extends Error {},
  ConsoleLogger: class ConsoleLogger { constructor() {} },
  LogLevel: { off: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 },
  WalletModule: class WalletModule { constructor() {} },
}
