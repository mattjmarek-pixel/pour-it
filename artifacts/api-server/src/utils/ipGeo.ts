/**
 * Server-side IP geolocation for THC geo-enforcement.
 *
 * SECURITY: the client's self-reported state is NEVER the authority for
 * issuing a location token. In production the server independently resolves
 * the caller's US state from their request IP. If the IP cannot be resolved
 * (lookup failure, non-US, private/unknown address) issuance FAILS CLOSED.
 *
 * Limitations (documented, not silently ignored): IP geolocation is
 * city/region-accurate, and a VPN can shift the apparent location — no
 * network-level geo control is VPN-proof. It is, however, independently
 * derived by the server rather than claimed by the client, which is the
 * enforcement bar for this gate.
 */

export interface IpGeoResult {
  /** Two-letter USPS abbreviation, or null when not resolvable to a US state. */
  stateAbbr: string | null;
  /** Machine reason when stateAbbr is null. */
  reason?: "private_ip" | "lookup_failed" | "not_us" | "no_region";
}

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^::ffff:127\./,
  /^f[cd][0-9a-f]{2}:/i, // fc00::/7 unique-local
  /^fe80:/i, // link-local
];

export function isPrivateOrLocalIp(ip: string | undefined | null): boolean {
  if (!ip) return true;
  const normalized = ip.replace(/^::ffff:/, "");
  return PRIVATE_IP_PATTERNS.some((re) => re.test(normalized) || re.test(ip));
}

export type IpGeoResolver = (ip: string) => Promise<IpGeoResult>;

/**
 * Default resolver: ipapi.co (HTTPS, no key required for low volume).
 * Any failure returns a null state — callers must fail closed.
 */
const defaultResolver: IpGeoResolver = async (ip) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: { "User-Agent": "pour-it-api/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return { stateAbbr: null, reason: "lookup_failed" };
    const data = (await res.json()) as {
      country_code?: string;
      region_code?: string;
      error?: boolean;
    };
    if (data.error) return { stateAbbr: null, reason: "lookup_failed" };
    if (data.country_code !== "US") return { stateAbbr: null, reason: "not_us" };
    const region = typeof data.region_code === "string" ? data.region_code.toUpperCase() : "";
    if (!/^[A-Z]{2}$/.test(region)) return { stateAbbr: null, reason: "no_region" };
    return { stateAbbr: region };
  } catch {
    return { stateAbbr: null, reason: "lookup_failed" };
  }
};

let resolver: IpGeoResolver = defaultResolver;

/** Test seam: replace the IP→state resolver. Returns a restore function. */
export function setIpGeoResolver(next: IpGeoResolver): () => void {
  const prev = resolver;
  resolver = next;
  return () => {
    resolver = prev;
  };
}

/** Resolve a request IP to a US state abbreviation, failing closed on any doubt. */
export async function resolveStateFromIp(ip: string | undefined | null): Promise<IpGeoResult> {
  if (isPrivateOrLocalIp(ip)) return { stateAbbr: null, reason: "private_ip" };
  return resolver(ip as string);
}
