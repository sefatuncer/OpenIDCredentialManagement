/**
 * Askar backend preloader - Node.js --require ile yüklenir
 * CJS/ESM modül ayrımından ÖNCE askar native binding'i kaydeder
 *
 * Credo-TS PRIMARY mimari: Askar ZORUNLUDUR.
 * Askar olmadan sistem başlatılamaz.
 */
try {
  const { registerAskar } = require('@openwallet-foundation/askar-shared')
  const { askarNodeJS } = require('@openwallet-foundation/askar-nodejs')
  registerAskar({ askar: askarNodeJS })
  console.log('[askar-preload] Askar backend registered successfully')
} catch (e) {
  console.error('[askar-preload] FATAL: Askar native module is required but not available.')
  console.error('[askar-preload] Ensure @openwallet-foundation/askar-nodejs is installed with native build tools (python3, make, g++).')
  console.error('[askar-preload] Error:', e.message)
  process.exit(1)
}
