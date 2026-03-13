/**
 * URL Validation Utilities
 *
 * SSRF protection — blocks private/reserved IP ranges.
 */

/**
 * Check if a URL points to a private/internal address.
 *
 * Limitation: checks hostname string only. A public hostname could resolve
 * to a private IP via DNS rebinding. Full mitigation requires connect-level
 * IP validation (v2 improvement).
 */
export function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()

    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return true

    // IPv6 addresses: Node.js URL parser keeps brackets and normalizes
    // e.g., [::ffff:127.0.0.1] → hostname "[::ffff:7f00:1]"
    // e.g., [0:0:0:0:0:0:0:1] → hostname "[::1]"
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      const ipv6 = hostname.slice(1, -1).toLowerCase()
      if (ipv6 === '::1' || ipv6 === '::') return true
      if (ipv6.startsWith('fe80:') || ipv6.startsWith('fc00:') || ipv6.startsWith('fd00:')) return true
      // IPv6-mapped IPv4 (::ffff:*) — block all to prevent private IP bypass
      if (ipv6.startsWith('::ffff:')) return true
    }

    // IPv4 dotted decimal
    const parts = hostname.split('.').map(Number)
    if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
      if (parts[0] === 10) return true
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
      if (parts[0] === 192 && parts[1] === 168) return true
      if (parts[0] === 169 && parts[1] === 254) return true
      if (parts[0] === 0) return true
      if (parts[0] === 127) return true // 127.0.0.0/8 full range
    }

    return false
  } catch {
    return true
  }
}
