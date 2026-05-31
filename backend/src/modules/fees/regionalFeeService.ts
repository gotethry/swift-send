type Region = 'north_america' | 'europe' | 'asia_pacific' | 'latin_america' | 'middle_east' | 'africa' | 'unknown';

const COUNTRY_TO_REGION: Record<string, Region> = {
  'US': 'north_america', 'CA': 'north_america', 'MX': 'north_america',
  'GB': 'europe', 'DE': 'europe', 'FR': 'europe', 'IT': 'europe', 'ES': 'europe',
  'NL': 'europe', 'BE': 'europe', 'AT': 'europe', 'CH': 'europe', 'SE': 'europe',
  'NO': 'europe', 'DK': 'europe', 'FI': 'europe', 'PL': 'europe', 'CZ': 'europe',
  'GR': 'europe', 'PT': 'europe', 'IE': 'europe',
  'JP': 'asia_pacific', 'CN': 'asia_pacific', 'KR': 'asia_pacific', 'SG': 'asia_pacific',
  'HK': 'asia_pacific', 'AU': 'asia_pacific', 'NZ': 'asia_pacific', 'IN': 'asia_pacific',
  'PH': 'asia_pacific', 'TH': 'asia_pacific', 'VN': 'asia_pacific', 'MY': 'asia_pacific',
  'ID': 'asia_pacific',
  'BR': 'latin_america', 'AR': 'latin_america', 'CO': 'latin_america', 'PE': 'latin_america',
  'CL': 'latin_america', 'VE': 'latin_america', 'EC': 'latin_america', 'BO': 'latin_america',
  'SA': 'middle_east', 'AE': 'middle_east', 'QA': 'middle_east', 'KW': 'middle_east',
  'BH': 'middle_east', 'OM': 'middle_east', 'IL': 'middle_east', 'JO': 'middle_east',
  'LB': 'middle_east',
  'ZA': 'africa', 'NG': 'africa', 'KE': 'africa', 'EG': 'africa', 'MA': 'africa', 'GH': 'africa',
};

const REGION_COMPLIANCE_RULES: Record<string, { countries: string[]; processingTime: string }> = {
  north_america: { countries: ['US', 'CA', 'MX'], processingTime: '1-2 business days' },
  europe: { countries: ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'GR', 'PT', 'IE'], processingTime: '1-3 business days' },
  asia_pacific: { countries: ['JP', 'CN', 'KR', 'SG', 'HK', 'AU', 'NZ', 'IN', 'PH', 'TH', 'VN', 'MY', 'ID'], processingTime: '2-4 business days' },
  latin_america: { countries: ['BR', 'AR', 'CO', 'PE', 'CL', 'VE', 'EC', 'BO'], processingTime: '3-5 business days' },
  middle_east: { countries: ['SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'IL', 'JO', 'LB'], processingTime: '2-4 business days' },
  africa: { countries: ['ZA', 'NG', 'KE', 'EG', 'MA', 'GH'], processingTime: '3-5 business days' },
  unknown: { countries: [], processingTime: '5-7 business days' },
};

export interface RegionalFeeConfig {
  region: Region;
  regionName: string;
  baseFeePercent: number;
  minFee: number;
  maxFee: number;
  networkSurcharge: number;
  complianceFee: number;
  fxMarginPercent: number;
  processingFee: number;
  description: string;
}

export interface FeePreview {
  amount: number;
  currency: string;
  destinationCountry: string;
  region: Region;
  breakdown: {
    baseFee: number;
    networkSurcharge: number;
    complianceFee: number;
    fxMargin: number;
    processingFee: number;
    totalFee: number;
  };
  totalFee: number;
  recipientGets: number;
  feePercentage: number;
  estimatedDelivery: string;
}

const REGIONAL_FEE_CONFIGS: Record<Region, RegionalFeeConfig> = {
  north_america: {
    region: 'north_america',
    regionName: 'North America',
    baseFeePercent: 0.005,
    minFee: 0.99,
    maxFee: 15.00,
    networkSurcharge: 0.00001,
    complianceFee: 0.50,
    fxMarginPercent: 0.002,
    processingFee: 0.25,
    description: 'Low fees due to established banking infrastructure',
  },
  europe: {
    region: 'europe',
    regionName: 'Europe',
    baseFeePercent: 0.008,
    minFee: 1.49,
    maxFee: 20.00,
    networkSurcharge: 0.00001,
    complianceFee: 1.00,
    fxMarginPercent: 0.003,
    processingFee: 0.50,
    description: 'GDPR-compliant processing with SEPA integration',
  },
  asia_pacific: {
    region: 'asia_pacific',
    regionName: 'Asia Pacific',
    baseFeePercent: 0.012,
    minFee: 1.99,
    maxFee: 25.00,
    networkSurcharge: 0.00002,
    complianceFee: 1.50,
    fxMarginPercent: 0.005,
    processingFee: 0.75,
    description: 'Higher fees due to diverse regulatory requirements',
  },
  latin_america: {
    region: 'latin_america',
    regionName: 'Latin America',
    baseFeePercent: 0.015,
    minFee: 2.49,
    maxFee: 30.00,
    networkSurcharge: 0.00002,
    complianceFee: 2.00,
    fxMarginPercent: 0.008,
    processingFee: 1.00,
    description: 'Premium for cash pickup networks and local compliance',
  },
  middle_east: {
    region: 'middle_east',
    regionName: 'Middle East',
    baseFeePercent: 0.01,
    minFee: 1.99,
    maxFee: 25.00,
    networkSurcharge: 0.00002,
    complianceFee: 2.00,
    fxMarginPercent: 0.006,
    processingFee: 0.75,
    description: 'Enhanced screening and compliance costs',
  },
  africa: {
    region: 'africa',
    regionName: 'Africa',
    baseFeePercent: 0.02,
    minFee: 3.49,
    maxFee: 35.00,
    networkSurcharge: 0.00003,
    complianceFee: 2.50,
    fxMarginPercent: 0.01,
    processingFee: 1.50,
    description: 'Highest due to mobile money integration and FX volatility',
  },
  unknown: {
    region: 'unknown',
    regionName: 'Unknown Region',
    baseFeePercent: 0.025,
    minFee: 4.99,
    maxFee: 50.00,
    networkSurcharge: 0.00003,
    complianceFee: 3.00,
    fxMarginPercent: 0.015,
    processingFee: 2.00,
    description: 'Default rates for unclassified destinations',
  },
};

export class RegionalFeeService {
  getRegionForCountry(countryCode: string): Region {
    if (!countryCode) return 'unknown';
    return COUNTRY_TO_REGION[countryCode.toUpperCase()] || 'unknown';
  }

  getFeeConfig(countryCode: string): RegionalFeeConfig {
    const region = this.getRegionForCountry(countryCode);
    return REGIONAL_FEE_CONFIGS[region];
  }

  getFeeConfigForRegion(region: Region): RegionalFeeConfig {
    return REGIONAL_FEE_CONFIGS[region];
  }

  getAllRegionConfigs(): RegionalFeeConfig[] {
    return Object.values(REGIONAL_FEE_CONFIGS);
  }

  calculateFee(amount: number, destinationCountry: string): FeePreview {
    const config = this.getFeeConfig(destinationCountry);
    const region = this.getRegionForCountry(destinationCountry);
    const regionRules = REGION_COMPLIANCE_RULES[region];

    const baseFee = Math.min(
      Math.max(amount * config.baseFeePercent, config.minFee),
      config.maxFee,
    );
    const networkSurcharge = config.networkSurcharge * (amount > 1000 ? 2 : 1);
    const complianceFee = config.complianceFee;
    const fxMargin = amount * config.fxMarginPercent;
    const processingFee = config.processingFee;

    const totalFee = baseFee + networkSurcharge + complianceFee + fxMargin + processingFee;
    const recipientGets = Math.max(0, amount - totalFee);

    return {
      amount,
      currency: 'USDC',
      destinationCountry: destinationCountry.toUpperCase(),
      region,
      breakdown: {
        baseFee: Math.round(baseFee * 100) / 100,
        networkSurcharge: Math.round(networkSurcharge * 100) / 100,
        complianceFee: Math.round(complianceFee * 100) / 100,
        fxMargin: Math.round(fxMargin * 100) / 100,
        processingFee: Math.round(processingFee * 100) / 100,
        totalFee: Math.round(totalFee * 100) / 100,
      },
      totalFee: Math.round(totalFee * 100) / 100,
      recipientGets: Math.round(recipientGets * 100) / 100,
      feePercentage: Math.round((totalFee / amount) * 10000) / 100,
      estimatedDelivery: regionRules?.processingTime || '3-5 business days',
    };
  }

  calculateFeeForRegion(amount: number, region: Region): FeePreview {
    const config = REGIONAL_FEE_CONFIGS[region];
    const regionRules = REGION_COMPLIANCE_RULES[region];
    const sampleCountry = regionRules?.countries[0] || 'XX';

    const baseFee = Math.min(
      Math.max(amount * config.baseFeePercent, config.minFee),
      config.maxFee,
    );
    const networkSurcharge = config.networkSurcharge * (amount > 1000 ? 2 : 1);
    const complianceFee = config.complianceFee;
    const fxMargin = amount * config.fxMarginPercent;
    const processingFee = config.processingFee;

    const totalFee = baseFee + networkSurcharge + complianceFee + fxMargin + processingFee;
    const recipientGets = Math.max(0, amount - totalFee);

    return {
      amount,
      currency: 'USDC',
      destinationCountry: sampleCountry,
      region,
      breakdown: {
        baseFee: Math.round(baseFee * 100) / 100,
        networkSurcharge: Math.round(networkSurcharge * 100) / 100,
        complianceFee: Math.round(complianceFee * 100) / 100,
        fxMargin: Math.round(fxMargin * 100) / 100,
        processingFee: Math.round(processingFee * 100) / 100,
        totalFee: Math.round(totalFee * 100) / 100,
      },
      totalFee: Math.round(totalFee * 100) / 100,
      recipientGets: Math.round(recipientGets * 100) / 100,
      feePercentage: Math.round((totalFee / amount) * 10000) / 100,
      estimatedDelivery: regionRules?.processingTime || '3-5 business days',
    };
  }

  getCountryFee(countryCode: string): { region: Region; config: RegionalFeeConfig; feePreview: (amount: number) => FeePreview } {
    const config = this.getFeeConfig(countryCode);
    const region = this.getRegionForCountry(countryCode);
    return {
      region,
      config,
      feePreview: (amount: number) => this.calculateFee(amount, countryCode),
    };
  }
}
