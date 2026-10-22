import { describe, expect, it } from 'vitest';
import { defaultVendorRegistry } from '../src/core/vendors';

describe('Vendor Registry & Alias Normalization', () => {
  it('normalizes common Indian merchants from aliases', () => {
    expect(defaultVendorRegistry.matchVendor('SWIGGY')?.normalized).toBe('Swiggy');
    expect(defaultVendorRegistry.matchVendor('SWIGGY INSTAMART')?.normalized).toBe('Swiggy');
    expect(defaultVendorRegistry.matchVendor('ZOMATO LIMITED')?.normalized).toBe('Zomato');
    expect(defaultVendorRegistry.matchVendor('AMAZON PAY')?.normalized).toBe('Amazon');
    expect(defaultVendorRegistry.matchVendor('FLIPKART INTERNET')?.normalized).toBe('Flipkart');
    expect(defaultVendorRegistry.matchVendor('ANI TECHNOLOGIES')?.normalized).toBe('Ola');
    expect(defaultVendorRegistry.matchVendor('IRCTC')?.normalized).toBe('IRCTC');
    expect(defaultVendorRegistry.matchVendor('BLINKIT COMMERCE')?.normalized).toBe('Blinkit');
    expect(defaultVendorRegistry.matchVendor('KIRANAKART')?.normalized).toBe('Zepto');
  });

  it('normalizes from VPA handles', () => {
    expect(defaultVendorRegistry.matchVendor('swiggy@icici')?.normalized).toBe('Swiggy');
    expect(defaultVendorRegistry.matchVendor('zomato@hdfcbank')?.normalized).toBe('Zomato');
    expect(defaultVendorRegistry.matchVendor('uber.india@icici')?.normalized).toBe('Uber');
  });

  it('allows user custom vendor alias additions and overrides', () => {
    defaultVendorRegistry.addCustomVendor('MY LOCAL DHABA', 'Local Dhaba', 'Food & Dining', 'Restaurants');
    expect(defaultVendorRegistry.matchVendor('MY LOCAL DHABA')?.normalized).toBe('Local Dhaba');
  });
});
