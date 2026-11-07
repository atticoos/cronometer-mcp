const PSEUDONYM_HEX_LENGTH = 32;
const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    keyCache.set(secret, key);
  }
  return key;
}

/**
 * Derives a stable pseudonymous telemetry ID from a Cronometer user ID.
 *
 * Cronometer user IDs are small sequential integers, so a plain hash could be
 * reversed by hashing every candidate. A keyed HMAC with a Worker secret
 * prevents that: without the secret, the ID cannot be linked back to an
 * account. It is also distinct from the grant's KV index hash, so traces
 * cannot be joined to stored grants.
 */
export async function telemetryUserId(
  secret: string | undefined,
  cronometerUserId: string | number | undefined,
): Promise<string | undefined> {
  if (!secret || cronometerUserId === undefined || cronometerUserId === "") return undefined;
  const key = await importKey(secret);
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`telemetry:cronometer:${cronometerUserId}`),
  );
  return [...new Uint8Array(mac)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, PSEUDONYM_HEX_LENGTH);
}
