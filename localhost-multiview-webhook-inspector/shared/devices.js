/**
 * Device Presets and Viewport Configuration
 * Defines supported device profiles, viewport dimensions, DPR, and breakpoint helpers.
 */

export const DEVICE_CATEGORIES = {
  MOBILE: 'mobile',
  TABLET: 'tablet',
  DESKTOP: 'desktop',
  CUSTOM: 'custom'
};

export const DEVICE_PRESETS = [
  // Mobile devices
  {
    id: 'iphone-15',
    name: 'iPhone 15',
    category: DEVICE_CATEGORIES.MOBILE,
    width: 393,
    height: 852,
    dpr: 3,
    isLandscape: false,
    hasBezel: true,
    platform: 'iOS'
  },
  {
    id: 'iphone-se',
    name: 'iPhone SE (3rd Gen)',
    category: DEVICE_CATEGORIES.MOBILE,
    width: 375,
    height: 667,
    dpr: 2,
    isLandscape: false,
    hasBezel: true,
    platform: 'iOS'
  },
  {
    id: 'iphone-15-pro-max',
    name: 'iPhone 15 Pro Max',
    category: DEVICE_CATEGORIES.MOBILE,
    width: 430,
    height: 932,
    dpr: 3,
    isLandscape: false,
    hasBezel: true,
    platform: 'iOS'
  },
  {
    id: 'pixel-8',
    name: 'Google Pixel 8',
    category: DEVICE_CATEGORIES.MOBILE,
    width: 412,
    height: 915,
    dpr: 2.625,
    isLandscape: false,
    hasBezel: true,
    platform: 'Android'
  },
  {
    id: 'galaxy-s23',
    name: 'Samsung Galaxy S23',
    category: DEVICE_CATEGORIES.MOBILE,
    width: 360,
    height: 780,
    dpr: 3,
    isLandscape: false,
    hasBezel: true,
    platform: 'Android'
  },

  // Tablets
  {
    id: 'ipad-10',
    name: 'iPad (10th Gen)',
    category: DEVICE_CATEGORIES.TABLET,
    width: 820,
    height: 1180,
    dpr: 2,
    isLandscape: false,
    hasBezel: true,
    platform: 'iPadOS'
  },
  {
    id: 'ipad-mini',
    name: 'iPad Mini (6th Gen)',
    category: DEVICE_CATEGORIES.TABLET,
    width: 744,
    height: 1133,
    dpr: 2,
    isLandscape: false,
    hasBezel: true,
    platform: 'iPadOS'
  },
  {
    id: 'ipad-pro-129',
    name: 'iPad Pro 12.9"',
    category: DEVICE_CATEGORIES.TABLET,
    width: 1024,
    height: 1366,
    dpr: 2,
    isLandscape: false,
    hasBezel: true,
    platform: 'iPadOS'
  },

  // Desktops and Laptops
  {
    id: 'laptop-1366',
    name: 'Laptop (1366x768)',
    category: DEVICE_CATEGORIES.DESKTOP,
    width: 1366,
    height: 768,
    dpr: 1,
    isLandscape: true,
    hasBezel: false,
    platform: 'Desktop'
  },
  {
    id: 'desktop-1080p',
    name: 'Desktop (1920x1080)',
    category: DEVICE_CATEGORIES.DESKTOP,
    width: 1920,
    height: 1080,
    dpr: 1,
    isLandscape: true,
    hasBezel: false,
    platform: 'Desktop'
  },
  {
    id: 'desktop-1440p',
    name: 'Desktop 1440p (2K)',
    category: DEVICE_CATEGORIES.DESKTOP,
    width: 2560,
    height: 1440,
    dpr: 1,
    isLandscape: true,
    hasBezel: false,
    platform: 'Desktop'
  },
  {
    id: 'desktop-4k',
    name: 'Desktop 4K (UHD)',
    category: DEVICE_CATEGORIES.DESKTOP,
    width: 3840,
    height: 2160,
    dpr: 1.5,
    isLandscape: true,
    hasBezel: false,
    platform: 'Desktop'
  },

  // Custom
  {
    id: 'custom',
    name: 'Custom Viewport',
    category: DEVICE_CATEGORIES.CUSTOM,
    width: 600,
    height: 800,
    dpr: 1,
    isLandscape: false,
    hasBezel: false,
    platform: 'Custom'
  }
];

export const DEFAULT_TRIO = [
  'iphone-15',      // Mobile: 393 x 852
  'ipad-10',        // Tablet: 820 x 1180
  'desktop-1080p'   // Desktop: 1920 x 1080
];

/**
 * Find a preset by ID, or return fallback custom preset if not found
 */
export function getDeviceById(id) {
  const found = DEVICE_PRESETS.find(p => p.id === id);
  if (found) {
    return { ...found };
  }
  return {
    id: 'custom',
    name: 'Custom Viewport',
    category: DEVICE_CATEGORIES.CUSTOM,
    width: 600,
    height: 800,
    dpr: 1,
    isLandscape: false,
    hasBezel: false,
    platform: 'Custom'
  };
}

/**
 * Rotate a device between portrait and landscape
 */
export function rotateDevice(device) {
  return {
    ...device,
    width: device.height,
    height: device.width,
    isLandscape: !device.isLandscape
  };
}

/**
 * Determine active CSS breakpoints based on width
 * Includes Tailwind CSS and Bootstrap standard breakpoints
 */
export function calculateResponsiveBreakpoints(width) {
  const tailwind = [];
  if (width >= 640) tailwind.push('sm');
  if (width >= 768) tailwind.push('md');
  if (width >= 1024) tailwind.push('lg');
  if (width >= 1280) tailwind.push('xl');
  if (width >= 1536) tailwind.push('2xl');
  const currentTailwind = tailwind.length > 0 ? tailwind[tailwind.length - 1] : '<sm';

  const bootstrap = [];
  if (width >= 576) bootstrap.push('sm');
  if (width >= 768) bootstrap.push('md');
  if (width >= 992) bootstrap.push('lg');
  if (width >= 1200) bootstrap.push('xl');
  if (width >= 1400) bootstrap.push('xxl');
  const currentBootstrap = bootstrap.length > 0 ? bootstrap[bootstrap.length - 1] : '<sm (xs)';

  return {
    width,
    tailwind: currentTailwind,
    tailwindActiveList: tailwind,
    bootstrap: currentBootstrap,
    bootstrapActiveList: bootstrap
  };
}
