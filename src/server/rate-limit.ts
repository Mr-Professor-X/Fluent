/** Tiny in-memory rate limiter for the expensive AI endpoints. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function allow(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}
