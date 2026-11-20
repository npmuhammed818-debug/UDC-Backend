import type { Request } from "express";

// Per-IP budgets key on the visitor's network, not the exact address: an IPv6
// user rotates through their /64 prefix freely, so the /64 is the billable
// unit. IPv4 keys on the full address. Zone ids and v4-mapped forms are folded.
export function normalizeClientIp(ip: string): string {
  let addr = ip.trim().toLowerCase();
  if (addr.startsWith("::ffff:")) addr = addr.slice("::ffff:".length);
  const zone = addr.indexOf("%");
  if (zone !== -1) addr = addr.slice(0, zone);
  if (!addr.includes(":")) return addr; // IPv4
  const groups = addr.split(":");
  return groups.slice(0, 4).join(":") + "::/64";
}

export function authRateLimitKey(req: Request) {
  return normalizeClientIp(req.ip || req.socket.remoteAddress || "unknown");
}
