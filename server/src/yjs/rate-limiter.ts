// Sliding-window rate limiter, one instance per WebSocket connection. Guards
// against guest abuse / runaway clients spamming Yjs updates (PRD security
// §12: "max 100 operations/second per user"). Excess messages within the
// window are dropped rather than applied or rebroadcast — the connection
// stays open, it's just throttled, so a fast typist or paste-heavy edit
// isn't mistaken for abuse and kicked outright.
export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  constructor(private readonly maxEvents: number, private readonly windowMs: number) {}

  tryConsume(now: number = Date.now()): boolean {
    while (this.timestamps.length > 0 && now - this.timestamps[0] > this.windowMs) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.maxEvents) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }
}
