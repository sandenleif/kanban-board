type Entry = { attempts: number; firstAttempt: number };

const store = new Map<string, Entry>();

// Clean stale entries every hour
if (typeof setInterval !== "undefined") {
  setInterval(
    () => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const [key, entry] of store.entries()) {
        if (entry.firstAttempt < cutoff) store.delete(key);
      }
    },
    60 * 60 * 1000
  );
}

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.firstAttempt > windowMs) {
    store.set(key, { attempts: 1, firstAttempt: now });
    return { allowed: true };
  }

  if (entry.attempts >= maxAttempts) {
    const retryAfterSeconds = Math.ceil(
      (entry.firstAttempt + windowMs - now) / 1000
    );
    return { allowed: false, retryAfterSeconds };
  }

  entry.attempts++;
  return { allowed: true };
}
