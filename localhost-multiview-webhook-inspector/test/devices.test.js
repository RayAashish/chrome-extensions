import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DEVICE_PRESETS,
  DEFAULT_TRIO,
  getDeviceById,
  rotateDevice,
  calculateResponsiveBreakpoints
} from '../shared/devices.js';

describe('Device Presets & Breakpoint Diagnostics', () => {
  it('should include all required default devices in the library', () => {
    assert(DEVICE_PRESETS.length >= 10);

    const ids = new Set();
    DEVICE_PRESETS.forEach(dev => {
      assert(dev.id, 'Device preset missing id');
      assert(dev.name, 'Device preset missing name');
      assert(dev.width > 0, `${dev.name} width must be positive`);
      assert(dev.height > 0, `${dev.name} height must be positive`);
      assert(dev.dpr >= 1, `${dev.name} DPR must be >= 1`);
      assert(!ids.has(dev.id), `Duplicate device ID detected: ${dev.id}`);
      ids.add(dev.id);
    });
  });

  it('should have exact specifications for default trio (iPhone 15, iPad, Desktop 1080p)', () => {
    const iphone15 = getDeviceById('iphone-15');
    assert.strictEqual(iphone15.width, 393);
    assert.strictEqual(iphone15.height, 852);
    assert.strictEqual(iphone15.dpr, 3);

    const ipad = getDeviceById('ipad-10');
    assert.strictEqual(ipad.width, 820);
    assert.strictEqual(ipad.height, 1180);
    assert.strictEqual(ipad.dpr, 2);

    const desktop = getDeviceById('desktop-1080p');
    assert.strictEqual(desktop.width, 1920);
    assert.strictEqual(desktop.height, 1080);
    assert.strictEqual(desktop.dpr, 1);
  });

  it('should correctly rotate a device between portrait and landscape', () => {
    const portraitPhone = getDeviceById('iphone-15');
    const landscapePhone = rotateDevice(portraitPhone);

    assert.strictEqual(landscapePhone.width, 852);
    assert.strictEqual(landscapePhone.height, 393);
    assert.strictEqual(landscapePhone.isLandscape, true);

    const reverted = rotateDevice(landscapePhone);
    assert.strictEqual(reverted.width, 393);
    assert.strictEqual(reverted.height, 852);
    assert.strictEqual(reverted.isLandscape, false);
  });

  it('should accurately calculate Tailwind and Bootstrap active breakpoints', () => {
    // Mobile iPhone 15: 393px width
    const bpMobile = calculateResponsiveBreakpoints(393);
    assert.strictEqual(bpMobile.tailwind, '<sm');
    assert.strictEqual(bpMobile.bootstrap, '<sm (xs)');

    // Tablet iPad: 820px width
    const bpTablet = calculateResponsiveBreakpoints(820);
    assert.strictEqual(bpTablet.tailwind, 'md');
    assert.strictEqual(bpTablet.bootstrap, 'md');

    // Desktop 1080p: 1920px width
    const bpDesktop = calculateResponsiveBreakpoints(1920);
    assert.strictEqual(bpDesktop.tailwind, '2xl');
    assert.strictEqual(bpDesktop.bootstrap, 'xxl');
  });
});
