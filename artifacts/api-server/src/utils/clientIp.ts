import type { Request } from "express";

/**
 * Derive the real client IP without trusting caller-controlled headers.
 *
 * Threat model: Express's `trust proxy: true` (or any setting that trusts an
 * attacker-reachable hop) lets a caller spoof X-Forwarded-For and defeat both
 * IP geolocation and IP-bound tokens. So we do it explicitly, with a NARROW
 * trust boundary:
 *
 * - The forwarded header is honored ONLY when the TCP peer is a trusted
 *   reverse-proxy address: loopback by default (the platform proxy connects
 *   to the app's local port), optionally extended via the
 *   TRUSTED_PROXY_IPS env var (comma-separated exact IPs and/or IPv4 CIDRs)
 *   for deployments where the proxy hop is not local. Private address space
 *   in general is NOT an identity for the proxy — an RFC1918/ULA peer that
 *   is not on the allowlist is treated as a direct client.
 * - When the peer is trusted, the proxy APPENDS the true client address as
 *   the LAST X-Forwarded-For entry; earlier entries are caller-supplied and
 *   ignored. We take only that last entry — exactly one trusted hop.
 * - When the peer is NOT trusted, X-Forwarded-For is entirely
 *   caller-controlled and is IGNORED; the peer address itself is the client
 *   IP. (For unproxied private peers that means a non-geolocatable address,
 *   and the location layer fails closed in production.)
 */

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;

function normalize(ip: string): string {
  return ip.replace(/^::ffff:/, "");
}

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function matchesEntry(ip: string, entry: string): boolean {
  if (!entry.includes("/")) return ip === entry;
  const [base, bitsRaw] = entry.split("/");
  const bits = Number(bitsRaw);
  const ipInt = ipv4ToInt(ip);
  const baseInt = base ? ipv4ToInt(base) : null;
  if (ipInt === null || baseInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** True when the immediate TCP peer is a trusted reverse-proxy hop. */
export function isTrustedProxyPeer(peer: string | undefined | null): boolean {
  if (!peer) return false;
  if (LOOPBACK.test(peer)) return true;
  const allowlist = (process.env["TRUSTED_PROXY_IPS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const normalized = normalize(peer);
  return allowlist.some((entry) => matchesEntry(normalized, entry) || peer === entry);
}

export function getClientIp(req: Request): string {
  const peer = req.socket.remoteAddress ?? "";

  if (!isTrustedProxyPeer(peer)) {
    // Direct connection (public, or an unrecognized private peer): never
    // trust forwarded headers.
    return normalize(peer);
  }

  // Trusted proxy hop: honor exactly one appended entry.
  const xff = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff[xff.length - 1] : xff;
  if (typeof raw === "string" && raw.length > 0) {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return normalize(last);
  }

  return normalize(peer);
}
