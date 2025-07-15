import { RateLimiter } from 'limiter';
import { capture } from '../utils/capture.js';

interface RateLimitConfig {
  tokensPerInterval: number;
  interval: number;
  keyPrefix: string;
}

const defaultConfig: RateLimitConfig = {
  tokensPerInterval: 10,
  interval: 60000, // 1 minute in milliseconds
  keyPrefix: 'rate-limit-',
};

export class RateLimiterService {
  private limiters: Map<string, RateLimiter> = new Map();
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  private getLimiter(key: string): RateLimiter {
    if (!this.limiters.has(key)) {
      this.limiters.set(
        key,
        new RateLimiter({
          tokensPerInterval: this.config.tokensPerInterval,
          interval: this.config.interval,
          fireImmediately: true,
        })
      );
    }
    return this.limiters.get(key)!;
  }

  async checkLimit(
    identifier: string,
    tokens = 1
  ): Promise<{ allowed: boolean; remaining: number }> {
    const limiter = this.getLimiter(identifier);
    const remaining = await limiter.removeTokens(tokens);
    
    if (remaining >= 0) {
      return { allowed: true, remaining };
    }

    // Log rate limit exceeded
    capture('rate_limit_exceeded', {
      identifier,
      limit: this.config.tokensPerInterval,
      interval: this.config.interval,
    });

    return { allowed: false, remaining: 0 };
  }

  // Clean up old limiters to prevent memory leaks
  cleanup(ageMs: number = 3600000) {
    const now = Date.now();
    for (const [key, limiter] of this.limiters.entries()) {
      // @ts-ignore - _lastFill is an internal property
      if (now - limiter._lastFill > ageMs) {
        this.limiters.delete(key);
      }
    }
  }
}

// Export a default instance
export const rateLimiter = new RateLimiterService();

// Clean up old limiters every hour
setInterval(() => rateLimiter.cleanup(), 3600000).unref();
