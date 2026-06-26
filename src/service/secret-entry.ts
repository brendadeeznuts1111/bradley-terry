/**
 * TTL-aware secret entries stored in Bun.secrets (or env) as JSON.
 * Plain strings remain valid for backward compatibility.
 */
export interface SecretEntry {
  readonly value: string;
  readonly expiresAt?: number;
}

export function encodeSecretEntry(value: string, ttlSeconds?: number): string {
  if (ttlSeconds === undefined) return value;
  const entry: SecretEntry = {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  };
  return JSON.stringify(entry);
}

export function decodeSecretEntry(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as SecretEntry;
    if (typeof parsed.value !== "string") return null;
    if (parsed.expiresAt !== undefined && Date.now() > parsed.expiresAt) {
      return null;
    }
    return parsed.value;
  } catch {
    return raw;
  }
}

export function isSecretEntryExpired(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as SecretEntry;
    return (
      typeof parsed.value === "string" &&
      parsed.expiresAt !== undefined &&
      Date.now() > parsed.expiresAt
    );
  } catch {
    return false;
  }
}
