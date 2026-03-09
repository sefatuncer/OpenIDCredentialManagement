---
title: "DID:Key Multibase/Multicodec Encoding"
tags: [did, did-key, multibase, multicodec, base58btc, ed25519, cryptography]
category: did
difficulty: medium
date: 2026-03-09
---

## Problem

DID:key metodunda Ed25519 public key'den geçerli bir DID oluşturmak gerekiyor. W3C DID:key spec'i multibase ve multicodec encoding gerektiriyor.

## Approach

Pure JavaScript implementation ile external dependency olmadan DID:key oluşturma:

```typescript
export async function createDidKey(publicKey: jose.KeyLike): Promise<{
  did: string
  kid: string
  publicJwk: jose.JWK
}> {
  const publicJwk = await jose.exportJWK(publicKey)

  // Ed25519 için multicodec prefix: 0xed01
  const xBytes = jose.base64url.decode(publicJwk.x!)

  // Multibase + multicodec encoding
  const multicodecBytes = new Uint8Array([0xed, 0x01, ...xBytes])

  // Base58btc multibase encoding (z prefix)
  const multibaseEncoded = base58btcEncode(multicodecBytes)

  const did = `did:key:z${multibaseEncoded}`
  const kid = `${did}#z${multibaseEncoded}`

  return { did, kid, publicJwk }
}
```

## Key Details

### Multicodec Prefixes
| Key Type | Prefix |
|----------|--------|
| Ed25519 public | 0xed01 |
| Ed25519 private | 0x8026 |
| secp256k1 public | 0xe7 |
| P-256 public | 0x8024 |

### Base58btc Encoding
- Bitcoin alfabesi kullanır: `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`
- 0, O, I, l karakterleri karışıklık önlemek için yok
- Multibase prefix: `z`

### DID:key Format
```
did:key:z<base58btc(multicodec_prefix + public_key_bytes)>
```

### KID (Key ID) Format
```
<did>#z<base58btc_encoded>
```

## Lessons Learned

1. **Spec uyumu kritik**: DID:key spec'e uyulmadan oluşturulan DID'ler diğer sistemlerle çalışmaz
2. **Pure JS tercih**: `bs58` gibi paketler yerine kendi implementasyonumuz native modül sorunu yaratmaz
3. **JWK interop**: Jose kütüphanesi JWK export/import ile sorunsuz çalışıyor

## Prevention

- DID:key oluştururken her zaman multicodec prefix kontrolü yap
- Yeni key tipleri eklerken multicodec registry'e bak: https://github.com/multiformats/multicodec
- Test: Oluşturulan DID'i resolve edip aynı public key'i geri alabildiğini doğrula
