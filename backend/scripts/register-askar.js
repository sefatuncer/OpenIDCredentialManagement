/**
 * Askar backend preloader - Node.js --require ile yüklenir
 * CJS/ESM modül ayrımından ÖNCE askar native binding'i kaydeder
 */
try {
  const { registerAskar } = require('@openwallet-foundation/askar-shared')
  const { askarNodeJS } = require('@openwallet-foundation/askar-nodejs')
  registerAskar({ askar: askarNodeJS })
  console.log('[askar-preload] Askar backend registered successfully')
} catch (e) {
  // Askar yoksa sessizce devam et - Jose fallback kullanılır
  console.log('[askar-preload] Askar not available, using Jose mode')
}
