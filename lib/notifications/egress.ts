import dns from "node:dns/promises";
import providerRules from "./provider-rules.json";

// Safe path/query token grammar: % is permitted ONLY when followed by two hex digits
export const SAFE_PATH_QUERY_PATTERN = /^\/(?:[A-Za-z0-9._~:/?@!$&'()*+,;=-]|%[0-9A-Fa-f]{2})*$/;

// RFC 1035 / RFC 1123 single-level DNS label literal
export const WILDCARD_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidPushHost(host: string): boolean {
  if (providerRules.exactHosts.includes(host)) {
    return true;
  }

  for (const suffix of providerRules.wildcardSuffixes) {
    if (host.endsWith("." + suffix)) {
      const label = host.slice(0, -(suffix.length + 1));
      if (WILDCARD_LABEL_PATTERN.test(label)) {
        return true;
      }
    }
  }

  return false;
}

export function canonicalizePushEndpoint(rawEndpoint: string): string {
  if (!rawEndpoint || typeof rawEndpoint !== "string") {
    throw new Error("Invalid push endpoint: string required");
  }

  // Reject C0 control characters (0x00-0x1F, 0x7F) or non-ASCII (>= 0x80) anywhere
  if (/[\x00-\x1F\x7F-\uFFFF]/.test(rawEndpoint)) {
    throw new Error("Invalid push endpoint: control characters or non-ASCII characters are forbidden");
  }

  // Trim leading and trailing ASCII space (0x20) ONLY
  const raw = rawEndpoint.replace(/^ +| +$/g, "");

  if (raw.length < 12 || raw.length > 2048 || raw.includes(" ")) {
    throw new Error("Invalid push endpoint: invalid length or internal spaces");
  }

  if (raw.includes("#")) {
    throw new Error("Invalid push endpoint: URL fragments are forbidden");
  }

  if (!raw.toLowerCase().startsWith("https://")) {
    throw new Error("Invalid push endpoint: protocol must be https");
  }

  const afterScheme = raw.slice(8);
  const slashPos = afterScheme.indexOf("/");

  if (slashPos < 1) {
    throw new Error("Invalid push endpoint: path component is required");
  }

  const authority = afterScheme.slice(0, slashPos);
  const pathQuery = afterScheme.slice(slashPos);

  // Validate Path/Query Suffix against token-level grammar (validates %HH escapes)
  if (!SAFE_PATH_QUERY_PATTERN.test(pathQuery)) {
    throw new Error("Invalid push endpoint: path/query contains prohibited characters or malformed percent-encoding");
  }

  // Authority validation
  if (authority.includes("@")) {
    throw new Error("Invalid push endpoint: userinfo is forbidden");
  }

  if (authority.includes("[") || authority.includes("]")) {
    throw new Error("Invalid push endpoint: raw IP addresses are forbidden");
  }

  let host: string;
  const colonPos = authority.indexOf(":");
  if (colonPos !== -1) {
    if (authority.indexOf(":", colonPos + 1) !== -1) {
      throw new Error("Invalid push endpoint: malformed authority");
    }
    const port = authority.slice(colonPos + 1);
    if (port !== "443") {
      throw new Error("Invalid push endpoint: only HTTPS port 443 is permitted");
    }
    host = authority.slice(0, colonPos);
  } else {
    host = authority;
  }

  host = host.toLowerCase();

  // Reject Raw IPv4
  if (/^([0-9]+(\.[0-9]+){3})$/.test(host)) {
    throw new Error("Invalid push endpoint: raw IP addresses are forbidden");
  }

  // Structural Host Allowlist Validation
  if (!isValidPushHost(host)) {
    throw new Error("Invalid push endpoint: destination must be an authorized browser push gateway");
  }

  return `https://${host}${pathQuery}`;
}

/**
 * IP Classification & DNS Pre-flight Validation (Defense-in-depth)
 */
export function parseIpv4ToUint32(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let uint = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = parseInt(p, 10);
    if (n < 0 || n > 255) return null;
    uint = (uint << 8) | n;
  }
  return uint >>> 0;
}

export function parseIpv6To16BitWords(ip: string): number[] | null {
  const clean = ip.toLowerCase();
  let parts = clean.split("::");
  if (parts.length > 2) return null;

  let left: string[] = [];
  let right: string[] = [];

  if (parts[0]) {
    left = parts[0].split(":").filter(Boolean);
  }
  if (parts[1]) {
    right = parts[1].split(":").filter(Boolean);
  }

  // Check for IPv4 suffix in last word (e.g. ::ffff:127.0.0.1)
  const lastSection = right.length > 0 ? right[right.length - 1] : (left.length > 0 ? left[left.length - 1] : "");
  let ipv4MappedWords: number[] | null = null;
  if (lastSection && lastSection.includes(".")) {
    const uint32 = parseIpv4ToUint32(lastSection);
    if (uint32 === null) return null;
    ipv4MappedWords = [(uint32 >>> 16) & 0xffff, uint32 & 0xffff];
    if (right.length > 0) right.pop();
    else if (left.length > 0) left.pop();
  }

  const totalSpecified = left.length + right.length + (ipv4MappedWords ? 2 : 0);
  if (parts.length === 1 && totalSpecified !== 8) return null;
  if (parts.length === 2 && totalSpecified > 7) return null;

  const missingZeros = 8 - totalSpecified;
  const words: number[] = [];

  for (const hex of left) {
    if (!/^[0-9a-f]{1,4}$/.test(hex)) return null;
    words.push(parseInt(hex, 16));
  }
  if (parts.length === 2) {
    for (let i = 0; i < missingZeros; i++) words.push(0);
  }
  for (const hex of right) {
    if (!/^[0-9a-f]{1,4}$/.test(hex)) return null;
    words.push(parseInt(hex, 16));
  }
  if (ipv4MappedWords) {
    words.push(ipv4MappedWords[0], ipv4MappedWords[1]);
  }

  return words.length === 8 ? words : null;
}

export function isPrivateOrReservedIpv4(uint32: number): boolean {
  const u = uint32 >>> 0;
  // 0.0.0.0/8
  if (((u & 0xff000000) >>> 0) === 0x00000000) return true;
  // 10.0.0.0/8
  if (((u & 0xff000000) >>> 0) === 0x0a000000) return true;
  // 100.64.0.0/10 (CGNAT)
  if (((u & 0xffc00000) >>> 0) === 0x64400000) return true;
  // 127.0.0.0/8 (Loopback)
  if (((u & 0xff000000) >>> 0) === 0x7f000000) return true;
  // 169.254.0.0/16 (Link-local / Cloud Metadata)
  if (((u & 0xffff0000) >>> 0) === 0xa9fe0000) return true;
  // 172.16.0.0/12
  if (((u & 0xfff00000) >>> 0) === 0xac100000) return true;
  // 192.168.0.0/16
  if (((u & 0xffff0000) >>> 0) === 0xc0a80000) return true;
  // 224.0.0.0/4 (Multicast)
  if (((u & 0xf0000000) >>> 0) === 0xe0000000) return true;
  // 240.0.0.0/4 (Reserved)
  if (((u & 0xf0000000) >>> 0) === 0xf0000000) return true;
  // 255.255.255.255/32 (Broadcast)
  if (u === 0xffffffff) return true;

  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  // Try IPv4
  const v4 = parseIpv4ToUint32(ip);
  if (v4 !== null) {
    return isPrivateOrReservedIpv4(v4);
  }

  // Try IPv6
  const words = parseIpv6To16BitWords(ip);
  if (words !== null) {
    // Check for IPv4-mapped IPv6: ::ffff:w6:w7 or ::ffff:a.b.c.d
    if (words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0xffff) {
      const v4Mapped = ((words[6] << 16) | words[7]) >>> 0;
      return isPrivateOrReservedIpv4(v4Mapped);
    }
    // ::/128 (Unspecified)
    if (words.every((w) => w === 0)) return true;
    // ::1/128 (Loopback)
    if (words.slice(0, 7).every((w) => w === 0) && words[7] === 1) return true;
    // fc00::/7 (Unique Local Address)
    if ((words[0] & 0xfe00) === 0xfc00) return true;
    // fe80::/10 (Link-Local Unicast)
    if ((words[0] & 0xffc0) === 0xfe80) return true;
    // ff00::/8 (Multicast)
    if ((words[0] & 0xff00) === 0xff00) return true;

    return false;
  }

  // If unparseable as IP, reject as unsafe
  return true;
}

export interface EgressValidationResult {
  ok: boolean;
  reason?: string;
  isTransient?: boolean;
}

/**
 * Validates endpoint before physical network dispatch (egress):
 * 1. Checks grammar canonicalization
 * 2. Pre-flight DNS resolution: Ensures IP is not private, loopback, or cloud-metadata
 * 3. Classifies transient DNS errors (EAI_AGAIN, ETIMEDOUT) vs permanent errors (ENOTFOUND)
 */
export async function validatePushEndpointEgress(endpoint: string): Promise<EgressValidationResult> {
  let canonical: string;
  try {
    canonical = canonicalizePushEndpoint(endpoint);
  } catch (err: any) {
    return { ok: false, reason: `canonicalization_failed: ${err.message}`, isTransient: false };
  }

  if (canonical !== endpoint) {
    return { ok: false, reason: "endpoint_not_canonical", isTransient: false };
  }

  // Extract hostname
  const afterScheme = endpoint.slice(8);
  const slashPos = afterScheme.indexOf("/");
  const authority = afterScheme.slice(0, slashPos);
  const host = authority.includes(":") ? authority.slice(0, authority.indexOf(":")) : authority;

  // DNS pre-flight address validation
  try {
    const addresses = await dns.lookup(host, { all: true });
    if (!addresses || addresses.length === 0) {
      return { ok: false, reason: "dns_lookup_empty", isTransient: false };
    }
    for (const addr of addresses) {
      if (isPrivateOrReservedIp(addr.address)) {
        return { ok: false, reason: `dns_resolved_private_ip: ${addr.address}`, isTransient: false };
      }
    }
  } catch (err: any) {
    const code = err.code || "";
    const isTransient = code === "EAI_AGAIN" || code === "ETIMEDOUT" || code === "ECONNRESET";
    return { ok: false, reason: `dns_lookup_error (${code}): ${err.message}`, isTransient };
  }

  return { ok: true };
}
