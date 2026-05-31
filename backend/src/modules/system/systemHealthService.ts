import { config } from '../../config';
import { createLogger } from '../../logger';
import { ComplianceService } from '../compliance/complianceService';
import { WalletService } from '../wallets/walletService';
import { getCircuitBreaker } from '../../utils/resilience';
import { checkDatabaseHealth } from '../../utils/databaseHealth';

export class SystemHealthService {
  constructor(private readonly compliance: ComplianceService, private readonly wallets: WalletService) {}
  private readonly logger = createLogger({ component: 'systemHealthService' });
  private readinessCache?: {
    expiresAt: number;
    stellar?: {
      status: 'online' | 'offline';
      latencyMs: number | null;
      checkedAt: string;
    };
    database?: {
      status: 'online' | 'offline';
      latencyMs: number | null;
      checkedAt: string;
      details?: string;
    };
  };

  async liveness() {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }

  async readiness() {
    const [stellarHealth, databaseHealth] = await Promise.all([
      this.checkStellarHealth(),
      this.checkDatabaseHealth(),
    ]);
    
    // Ensure we have valid health objects
    const stellarStatus = stellarHealth?.status || 'offline';
    const databaseStatus = databaseHealth?.status || 'offline';
    
    const allServicesHealthy = 
      stellarStatus === 'online' && 
      databaseStatus === 'online';
    
    return {
      status: allServicesHealthy ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: config.env,
      stellar: {
        network: config.stellar.network,
        horizonUrl: config.stellar.horizonUrl,
        status: stellarHealth?.status || 'offline',
        latencyMs: stellarHealth?.latencyMs || null,
        checkedAt: stellarHealth?.checkedAt || new Date().toISOString(),
      },
      database: {
        url: config.persistence.databaseUrl,
        status: databaseHealth?.status || 'offline',
        latencyMs: databaseHealth?.latencyMs || null,
        checkedAt: databaseHealth?.checkedAt || new Date().toISOString(),
        details: databaseHealth?.details,
      },
      queues: {
        settlementDelayMs: config.queues.settlementDelayMs,
        maxAttempts: config.queues.maxSettlementAttempts,
      },
    };
  }

  private async checkStellarHealth() {
    if (this.readinessCache && this.readinessCache.expiresAt > Date.now()) {
      return this.readinessCache.stellar;
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const horizonBreaker = getCircuitBreaker('stellar-horizon-health', {
      failureThreshold: 3,
      resetTimeoutMs: 15_000,
    });

    try {
      const response = await horizonBreaker.execute(async () => {
        const result = await fetch(config.stellar.horizonUrl, {
          method: 'GET',
          signal: controller.signal,
        });
        if (!result.ok) {
          throw new Error(`Horizon responded with ${result.status}`);
        }
        return result;
      });
      const latencyMs = Date.now() - startedAt;

      const stellar = {
        status: response.ok ? 'online' as const : 'offline' as const,
        latencyMs,
        checkedAt: new Date().toISOString(),
      };
      
      // Initialize readinessCache with both stellar and database
      if (!this.readinessCache) {
        this.readinessCache = {
          expiresAt: Date.now() + config.performance.healthCacheTtlMs,
          stellar,
          database: {
            status: 'offline',
            latencyMs: null,
            checkedAt: new Date().toISOString(),
            details: 'Database not initialized yet',
          },
        };
      } else {
        this.readinessCache.stellar = stellar;
        this.readinessCache.expiresAt = Date.now() + config.performance.healthCacheTtlMs;
      }
      
      this.logger.info({ latencyMs, status: stellar.status }, 'stellar health checked');
      return stellar;
    } catch {
      const stellar = {
        status: 'offline' as const,
        latencyMs: null,
        checkedAt: new Date().toISOString(),
      };
      
      // Initialize readinessCache with both stellar and database
      if (!this.readinessCache) {
        this.readinessCache = {
          expiresAt: Date.now() + config.performance.healthCacheTtlMs,
          stellar,
          database: {
            status: 'offline',
            latencyMs: null,
            checkedAt: new Date().toISOString(),
            details: 'Database not initialized yet',
          },
        };
      } else {
        this.readinessCache.stellar = stellar;
        this.readinessCache.expiresAt = Date.now() + config.performance.healthCacheTtlMs;
      }
      
      this.logger.warn('stellar health unavailable');
      return stellar;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async checkDatabaseHealth() {
    if (this.readinessCache && this.readinessCache.expiresAt > Date.now()) {
      return this.readinessCache.database;
    }

    try {
      const startedAt = Date.now();
      const databaseHealth = await checkDatabaseHealth();
      const latencyMs = Date.now() - startedAt;

      const database = {
        status: databaseHealth.status,
        latencyMs,
        checkedAt: databaseHealth.checkedAt,
        details: databaseHealth.details,
      };
      
      // Initialize readinessCache with both stellar and database
      if (!this.readinessCache) {
        this.readinessCache = {
          expiresAt: Date.now() + config.performance.healthCacheTtlMs,
          stellar: {
            status: 'offline',
            latencyMs: null,
            checkedAt: new Date().toISOString(),
          },
          database,
        };
      } else {
        this.readinessCache.database = database;
        this.readinessCache.expiresAt = Date.now() + config.performance.healthCacheTtlMs;
      }
      
      this.logger.info({ latencyMs, status: database.status }, 'database health checked');
      return database;
    } catch (error) {
      const database = {
        status: 'offline' as const,
        latencyMs: null,
        checkedAt: new Date().toISOString(),
        details: error instanceof Error ? error.message : String(error),
      };
      
      // Initialize readinessCache with both stellar and database
      if (!this.readinessCache) {
        this.readinessCache = {
          expiresAt: Date.now() + config.performance.healthCacheTtlMs,
          stellar: {
            status: 'offline',
            latencyMs: null,
            checkedAt: new Date().toISOString(),
          },
          database,
        };
      } else {
        this.readinessCache.database = database;
        this.readinessCache.expiresAt = Date.now() + config.performance.healthCacheTtlMs;
      }
      
      this.logger.warn('database health unavailable');
      return database;
    }
  }
}
