/** Tiny in-memory rate limiter for the expensive AI endpoints. */
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 5000;

/** Expired buckets would otherwise pile up for every user id the server has ever seen. */
function prune(now: number) {
  for (const [key, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(key);
}

export function allow(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    if (buckets.size > MAX_BUCKETS) prune(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}
