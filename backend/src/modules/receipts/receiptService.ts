import crypto from 'crypto';
import { createLogger } from '../../logger';
import { config, receiptConfig } from '../../config';

interface ReceiptToken {
  token: string;
  expiresAt: number;
  transactionId: string;
}

interface ReceiptVerification {
  valid: boolean;
  transactionId?: string;
  isExpired: boolean;
}

interface CacheEntry {
  transactionId: string;
  expiresAt: number;
  signature: string;
}

class ReceiptService {
  private logger: Logger;
  private tokenCache: Map<string, CacheEntry>;
  private readonly HMAC_ALGORITHM = 'sha256';
  private readonly TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_CACHE_SIZE = 10000;
  private cacheCleanupInterval: NodeJS.Timer | null = null;

  constructor() {
    this.logger = createLogger({ component: 'receiptService' });
    this.tokenCache = new Map();
    this.initializeCacheCleanup();
  }

  /**
   * Generate a receipt token for a transaction
   * @param transactionId - Unique transaction identifier
   * @returns Receipt token object with expiration
   */
  public generateReceiptToken(transactionId: string): ReceiptToken {
    if (!transactionId || typeof transactionId !== 'string') {
      this.logger.warn('Invalid transactionId provided for token generation', {
        transactionId: typeof transactionId,
      });
      throw new Error('Valid transactionId is required');
    }

    const expiresAt = Date.now() + this.TOKEN_EXPIRY_MS;
    const tokenData = `${transactionId}:${expiresAt}`;

    // Generate HMAC signature
    const hmacSecret = this.getHmacSecret();
    const signature = crypto
      .createHmac(this.HMAC_ALGORITHM, hmacSecret)
      .update(tokenData)
      .digest('hex');

    const token = `${tokenData}.${signature}`;

    // Cache the token for quick verification
    this.cacheToken(token, transactionId, expiresAt, signature);

    this.logger.debug('Receipt token generated', {
      transactionId,
      expiresAt: new Date(expiresAt).toISOString(),
    });

    return {
      token,
      expiresAt,
      transactionId,
    };
  }

  /**
   * Verify a receipt token
   * @param token - Token to verify
   * @returns Verification result with transaction ID if valid
   */
  public verifyReceiptToken(token: string): ReceiptVerification {
    if (!token || typeof token !== 'string') {
      this.logger.warn('Invalid token provided for verification', {
        tokenType: typeof token,
      });
      return {
        valid: false,
        isExpired: false,
      };
    }

    try {
      // Check cache first for performance
      const cachedEntry = this.tokenCache.get(token);
      if (cachedEntry) {
        const isExpired = Date.now() > cachedEntry.expiresAt;
        if (!isExpired) {
          return {
            valid: true,
            transactionId: cachedEntry.transactionId,
            isExpired: false,
          };
        }
        // Remove expired token from cache
        this.tokenCache.delete(token);
      }

      // Parse token
      const parts = token.split('.');
      if (parts.length !== 2) {
        this.logger.warn('Malformed token format', { tokenLength: parts.length });
        return {
          valid: false,
          isExpired: false,
        };
      }

      const [tokenData, providedSignature] = parts;
      const [transactionId, expiresAtStr] = tokenData.split(':');

      if (!transactionId || !expiresAtStr) {
        this.logger.warn('Invalid token data structure');
        return {
          valid: false,
          isExpired: false,
        };
      }

      const expiresAt = parseInt(expiresAtStr, 10);
      if (isNaN(expiresAt)) {
        this.logger.warn('Invalid expiration timestamp in token');
        return {
          valid: false,
          isExpired: false,
        };
      }

      // Check expiration
      const isExpired = Date.now() > expiresAt;
      if (isExpired) {
        this.logger.debug('Token has expired', {
          transactionId,
          expiresAt: new Date(expiresAt).toISOString(),
        });
        return {
          valid: false,
          transactionId,
          isExpired: true,
        };
      }

      // Verify HMAC signature
      const hmacSecret = this.getHmacSecret();
      const expectedSignature = crypto
        .createHmac(this.HMAC_ALGORITHM, hmacSecret)
        .update(tokenData)
        .digest('hex');

      // Constant-time comparison to prevent timing attacks
      const signatureMatch = crypto.timingSafeEqual(
        Buffer.from(providedSignature),
        Buffer.from(expectedSignature)
      );

      if (!signatureMatch) {
        this.logger.warn('Token signature verification failed', {
          transactionId,
        });
        return {
          valid: false,
          isExpired: false,
        };
      }

      // Cache valid token
      this.cacheToken(token, transactionId, expiresAt, expectedSignature);

      return {
        valid: true,
        transactionId,
        isExpired: false,
      };
    } catch (error) {
      this.logger.error('Error verifying receipt token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        valid: false,
        isExpired: false,
      };
    }
  }

  /**
   * Revoke a receipt token
   * @param token - Token to revoke
   */
  public revokeReceiptToken(token: string): void {
    if (this.tokenCache.has(token)) {
      this.tokenCache.delete(token);
      this.logger.debug('Receipt token revoked');
    }
  }

  /**
   * Clear all cached tokens
   */
  public clearCache(): void {
    const cacheSize = this.tokenCache.size;
    this.tokenCache.clear();
    this.logger.info('Receipt token cache cleared', { clearedTokens: cacheSize });
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.tokenCache.size,
      maxSize: this.MAX_CACHE_SIZE,
    };
  }

  // Private methods

  /**
   * Get HMAC secret from configuration
   */
  private getHmacSecret(): string {
    const secret = process.env.RECEIPT_HMAC_SECRET || receiptConfig.receiptSecret || config.encryption.key;
    if (!secret) {
      throw new Error('RECEIPT_HMAC_SECRET or DATA_ENCRYPTION_KEY must be configured');
    }
    return secret;
  }

  /**
   * Cache a token entry
   */
  private cacheToken(
    token: string,
    transactionId: string,
    expiresAt: number,
    signature: string
  ): void {
    // Simple cache eviction: if cache is full, clear oldest entries
    if (this.tokenCache.size >= this.MAX_CACHE_SIZE) {
      const entriesToRemove = Math.ceil(this.MAX_CACHE_SIZE * 0.1); // Remove 10%
      let removed = 0;
      for (const [key] of this.tokenCache) {
        if (removed >= entriesToRemove) break;
        this.tokenCache.delete(key);
        removed++;
      }
    }

    this.tokenCache.set(token, {
      transactionId,
      expiresAt,
      signature,
    });
  }

  /**
   * Initialize periodic cache cleanup for expired entries
   */
  private initializeCacheCleanup(): void {
    // Run cleanup every 1 hour
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupExpiredTokens();
    }, 60 * 60 * 1000);

    // Ensure process doesn't hang if cleanup interval is the only active timer
    if (this.cacheCleanupInterval && typeof this.cacheCleanupInterval.unref === 'function') {
      this.cacheCleanupInterval.unref();
    }
  }

  /**
   * Remove expired tokens from cache
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now();
    let removed = 0;

    for (const [token, entry] of this.tokenCache) {
      if (now > entry.expiresAt) {
        this.tokenCache.delete(token);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug('Expired tokens cleaned from cache', {
        removedCount: removed,
        remainingCount: this.tokenCache.size,
      });
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    this.tokenCache.clear();
    this.logger.debug('ReceiptService destroyed');
  }
}

// Export singleton instance
export const receiptService = new ReceiptService();
export default ReceiptService;
