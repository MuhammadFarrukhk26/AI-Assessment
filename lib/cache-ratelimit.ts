// In-memory cache and rate-limiting utilities to prevent quota exhaustion and API abuse.

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// 1. In-Memory Cache with TTL and Max Capacity
class SimpleMemoryCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T, ttlMs: number): void {
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }
}

export const assessmentCache = new SimpleMemoryCache<unknown>(200);

// 2. Sliding Window Rate Limiter
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Checks if a given identifier (e.g., client IP) has exceeded rate limits.
 * @param identifier Client identifier (IP)
 * @param limit Max allowed requests within window
 * @param windowMs Time window in milliseconds
 */
export function checkRateLimit(
  identifier: string,
  limit = 20,
  windowMs = 10 * 60 * 1000 // 10 minutes
): { success: boolean; limit: number; remaining: number; resetInSeconds: number } {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  // If no record or record has expired, reset window
  if (!record || now > record.resetAt) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      success: true,
      limit,
      remaining: limit - 1,
      resetInSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (record.count >= limit) {
    return {
      success: false,
      limit,
      remaining: 0,
      resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.count += 1;
  return {
    success: true,
    limit,
    remaining: limit - record.count,
    resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
  };
}

/**
 * Extracts client IP from request headers.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}
