import { NotFoundError } from '../../errors';

// ─── Local type definitions ────────────────────────────────────────────────

export interface CashOutMethod {
  type: 'cash_pickup' | 'bank_transfer' | 'mobile_money' | 'home_delivery';
  partnerName: string;
  deliveryMinMinutes: number;
  deliveryMaxMinutes: number;
}

export interface CountryInfo {
  countryCode: string;
  countryName: string;
  currencyCode: string;
  exchangeRate: number | null;
  rateStaleAt?: string;          // ISO 8601 timestamp; present when rate is stale
  isRestricted: boolean;
  complianceRules: string[];
  cashOutMethods: CashOutMethod[];
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
}

interface RateCacheEntry {
  rate: number;
  cachedAt: number;   // Date.now() timestamp
}

// ─── Static country registry ───────────────────────────────────────────────

interface StaticCountryData {
  countryName: string;
  currencyCode: string;
  cashOutMethods: CashOutMethod[];
  complianceRules: string[];
  defaultRate: number;  // seed rate used until a live rate is fetched
  baselineRisk: number;
}

const COUNTRY_REGISTRY: Record<string, StaticCountryData> = {
  MX: {
    countryName: 'Mexico',
    currencyCode: 'MXN',
    defaultRate: 17.25,
    cashOutMethods: [
      {
        type: 'cash_pickup',
        partnerName: 'Oxxo Pay',
        deliveryMinMinutes: 15,
        deliveryMaxMinutes: 60,
      },
      {
        type: 'bank_transfer',
        partnerName: 'SPEI',
        deliveryMinMinutes: 30,
        deliveryMaxMinutes: 120,
      },
      {
        type: 'mobile_money',
        partnerName: 'CoDi',
        deliveryMinMinutes: 5,
        deliveryMaxMinutes: 15,
      },
    ],
    complianceRules: [
      'Government ID required for cash pickup',
      'Transfers above $500 USD require additional verification',
    ],
    baselineRisk: 25,
  },
  PH: {
    countryName: 'Philippines',
    currencyCode: 'PHP',
    defaultRate: 56.5,
    cashOutMethods: [
      {
        type: 'cash_pickup',
        partnerName: 'Palawan Pawnshop',
        deliveryMinMinutes: 30,
        deliveryMaxMinutes: 120,
      },
      {
        type: 'bank_transfer',
        partnerName: 'BancNet',
        deliveryMinMinutes: 60,
        deliveryMaxMinutes: 240,
      },
      {
        type: 'mobile_money',
        partnerName: 'GCash',
        deliveryMinMinutes: 5,
        deliveryMaxMinutes: 30,
      },
    ],
    complianceRules: [
      'Valid government-issued ID required',
      'Recipient must have a registered mobile number',
    ],
    baselineRisk: 22,
  },
  GT: {
    countryName: 'Guatemala',
    currencyCode: 'GTQ',
    defaultRate: 7.75,
    cashOutMethods: [
      {
        type: 'cash_pickup',
        partnerName: 'Banrural',
        deliveryMinMinutes: 30,
        deliveryMaxMinutes: 90,
      },
      {
        type: 'bank_transfer',
        partnerName: 'Banco Industrial',
        deliveryMinMinutes: 60,
        deliveryMaxMinutes: 180,
      },
    ],
    complianceRules: [
      'DPI (national ID) required for cash pickup',
    ],
    baselineRisk: 18,
  },
  SV: {
    countryName: 'El Salvador',
    currencyCode: 'USD',
    defaultRate: 1.0,
    cashOutMethods: [
      {
        type: 'cash_pickup',
        partnerName: 'Banco Agrícola',
        deliveryMinMinutes: 15,
        deliveryMaxMinutes: 60,
      },
      {
        type: 'mobile_money',
        partnerName: 'Chivo Wallet',
        deliveryMinMinutes: 5,
        deliveryMaxMinutes: 15,
      },
      {
        type: 'home_delivery',
        partnerName: 'Rapidito',
        deliveryMinMinutes: 120,
        deliveryMaxMinutes: 480,
      },
    ],
    complianceRules: [
      'DUI (national ID) required for cash pickup',
    ],
    baselineRisk: 15,
  },
};

// Restricted corridors — sourced from ComplianceService.highRiskDestinations
const RESTRICTED_COUNTRIES = new Set(['RU', 'BY', 'IR', 'KP']);

const RATE_TTL_MS = 60 * 60 * 1000; // 60 minutes

// ─── Service ───────────────────────────────────────────────────────────────

export class CountryMetadataService {
  private rateCache = new Map<string, RateCacheEntry>();

  constructor() {
    // Seed the rate cache with default rates so the service is immediately usable
    for (const [code, data] of Object.entries(COUNTRY_REGISTRY)) {
      this.rateCache.set(code, {
        rate: data.defaultRate,
        cachedAt: Date.now(),
      });
    }
  }

  /**
   * Returns full country metadata for the given ISO 3166-1 alpha-2 code.
   *
   * - Throws `NotFoundError` for codes that are neither supported nor restricted.
   * - Returns `isRestricted: true` with `cashOutMethods: []` for restricted codes.
   */
  async getCountryInfo(code: string): Promise<CountryInfo> {
    const upper = code.toUpperCase();
    const riskProfile = this.getRiskProfile(upper);

    // Restricted corridor — return minimal info without cash-out methods
    if (RESTRICTED_COUNTRIES.has(upper)) {
      return {
        countryCode: upper,
        countryName: upper,   // no display name needed for restricted countries
        currencyCode: '',
        exchangeRate: null,
        isRestricted: true,
        complianceRules: [],
        cashOutMethods: [],
        riskScore: 100,
        riskLevel: 'high',
      };
    }

    const staticData = COUNTRY_REGISTRY[upper];
    if (!staticData) {
      throw new NotFoundError(`Country not supported: ${upper}`);
    }

    // Refresh rate if stale before building the response
    await this.refreshRateIfStale(upper);

    const cached = this.rateCache.get(upper);
    const exchangeRate = cached ? cached.rate : null;

    // Determine whether the cached rate is stale (i.e. refresh failed)
    const isStale = cached
      ? Date.now() - cached.cachedAt > RATE_TTL_MS
      : false;

    const result: CountryInfo = {
      countryCode: upper,
      countryName: staticData.countryName,
      currencyCode: staticData.currencyCode,
      exchangeRate,
      isRestricted: false,
      complianceRules: staticData.complianceRules,
      cashOutMethods: staticData.cashOutMethods,
      riskScore: riskProfile.score,
      riskLevel: riskProfile.level,
    };

    if (isStale && cached) {
      result.rateStaleAt = new Date(cached.cachedAt).toISOString();
    }

    return result;
  }

  getRiskProfile(code: string): { score: number; level: 'low' | 'medium' | 'high' } {
    const upper = code.toUpperCase();

    if (RESTRICTED_COUNTRIES.has(upper)) {
      return { score: 100, level: 'high' };
    }

    const staticData = COUNTRY_REGISTRY[upper];
    if (!staticData) {
      throw new NotFoundError(`Country not supported: ${upper}`);
    }

    const complianceWeight = Math.min(staticData.complianceRules.length * 8, 24);
    const methodWeight = Math.max(0, 12 - staticData.cashOutMethods.length * 2);
    const score = Math.min(100, staticData.baselineRisk + complianceWeight + methodWeight);

    if (score >= 60) {
      return { score, level: 'high' };
    }

    if (score >= 35) {
      return { score, level: 'medium' };
    }

    return { score, level: 'low' };
  }

  /**
   * Refreshes the exchange rate for `code` when the cached value is older than
   * 60 minutes.  On upstream failure the existing cached rate is kept and
   * `rateStaleAt` will be set by `getCountryInfo`.
   */
  async refreshRateIfStale(code: string): Promise<void> {
    const upper = code.toUpperCase();
    const cached = this.rateCache.get(upper);

    if (cached && Date.now() - cached.cachedAt <= RATE_TTL_MS) {
      // Still fresh — nothing to do
      return;
    }

    try {
      const freshRate = await this.fetchLiveRate(upper);
      this.rateCache.set(upper, { rate: freshRate, cachedAt: Date.now() });
    } catch {
      // Upstream unavailable — keep the stale cached entry as-is so callers
      // can still return a rate with a `rateStaleAt` timestamp.
    }
  }

  /**
   * Simulates fetching a live exchange rate from an upstream source.
   * In production this would call a real FX API.  For now it returns the
   * static default rate so the service is self-contained.
   *
   * Exposed as a separate method so tests can override it via jest.spyOn.
   */
  async fetchLiveRate(code: string): Promise<number> {
    const staticData = COUNTRY_REGISTRY[code];
    if (!staticData) {
      throw new Error(`No rate source for country: ${code}`);
    }
    return staticData.defaultRate;
  }

  /**
   * Directly sets a cache entry — used by tests to seed stale or custom rates.
   */
  setCacheEntry(code: string, entry: RateCacheEntry): void {
    this.rateCache.set(code.toUpperCase(), entry);
  }

  /**
   * Returns the current cache entry for a country code — used by tests.
   */
  getCacheEntry(code: string): RateCacheEntry | undefined {
    return this.rateCache.get(code.toUpperCase());
  }
}
