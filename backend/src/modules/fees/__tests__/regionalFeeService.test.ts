import { RegionalFeeService } from '../regionalFeeService';

describe('RegionalFeeService', () => {
  let service: RegionalFeeService;

  beforeEach(() => {
    service = new RegionalFeeService();
  });

  it('should resolve correct region for country', () => {
    expect(service.getRegionForCountry('MX')).toBe('north_america');
    expect(service.getRegionForCountry('DE')).toBe('europe');
    expect(service.getRegionForCountry('JP')).toBe('asia_pacific');
    expect(service.getRegionForCountry('BR')).toBe('latin_america');
    expect(service.getRegionForCountry('AE')).toBe('middle_east');
    expect(service.getRegionForCountry('NG')).toBe('africa');
    expect(service.getRegionForCountry('XX')).toBe('unknown');
  });

  it('should return fee config for any country', () => {
    const config = service.getFeeConfig('MX');
    expect(config).toBeDefined();
    expect(config.region).toBe('north_america');
    expect(config.baseFeePercent).toBeGreaterThan(0);
  });

  it('should return all region configs', () => {
    const configs = service.getAllRegionConfigs();
    expect(configs.length).toBe(7);
    const regions = configs.map((c) => c.region);
    expect(regions).toContain('north_america');
    expect(regions).toContain('europe');
    expect(regions).toContain('unknown');
  });

  it('should calculate fee preview for a given amount and country', () => {
    const preview = service.calculateFee(1000, 'MX');
    expect(preview.amount).toBe(1000);
    expect(preview.destinationCountry).toBe('MX');
    expect(preview.region).toBe('north_america');
    expect(preview.totalFee).toBeGreaterThan(0);
    expect(preview.recipientGets).toBeLessThan(1000);
    expect(preview.feePercentage).toBeGreaterThan(0);
    expect(preview.breakdown).toHaveProperty('baseFee');
    expect(preview.breakdown).toHaveProperty('networkSurcharge');
    expect(preview.breakdown).toHaveProperty('complianceFee');
    expect(preview.breakdown).toHaveProperty('fxMargin');
    expect(preview.breakdown).toHaveProperty('processingFee');
    expect(preview.breakdown).toHaveProperty('totalFee');
  });

  it('should calculate fee for region directly', () => {
    const preview = service.calculateFeeForRegion(1000, 'europe');
    expect(preview.region).toBe('europe');
    expect(preview.totalFee).toBeGreaterThan(0);
  });

  it('should have higher fees for africa than north_america', () => {
    const usFee = service.calculateFee(1000, 'US');
    const ngFee = service.calculateFee(1000, 'NG');
    expect(ngFee.totalFee).toBeGreaterThan(usFee.totalFee);
    expect(ngFee.feePercentage).toBeGreaterThan(usFee.feePercentage);
  });

  it('should return fee preview for lower amounts meeting minimum', () => {
    const config = service.getFeeConfig('US');
    const preview = service.calculateFee(10, 'US');
    expect(preview.totalFee).toBeGreaterThanOrEqual(config.minFee);
  });

  it('should respect max fee caps', () => {
    const preview = service.calculateFee(100000, 'US');
    expect(preview.breakdown.baseFee).toBeLessThanOrEqual(15);
  });

  it('should get country fee helper', () => {
    const countryFee = service.getCountryFee('DE');
    expect(countryFee.region).toBe('europe');
    expect(typeof countryFee.feePreview).toBe('function');
    const preview = countryFee.feePreview(500);
    expect(preview.destinationCountry).toBe('DE');
  });

  it('should include estimated delivery time', () => {
    const preview = service.calculateFee(500, 'PH');
    expect(preview.estimatedDelivery).toBeDefined();
    expect(preview.estimatedDelivery.length).toBeGreaterThan(0);
  });
});
