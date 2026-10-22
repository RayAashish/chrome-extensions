import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateScrollPercentages, computeTargetScrollPixels } from '../shared/protocol.js';

describe('Scroll-Percentage Math', () => {
  it('should calculate 0% when at the very top of document', () => {
    const result = calculateScrollPercentages(0, 2000, 800, 0, 1000, 1000);
    assert.strictEqual(result.scrollYPercent, 0);
    assert.strictEqual(result.scrollXPercent, 0);
    assert.strictEqual(result.maxScrollY, 1200);
  });

  it('should calculate 50% when halfway down a scrollable document', () => {
    // scrollHeight: 3000, clientHeight: 1000 -> maxScroll: 2000. scrollTop: 1000 -> 50%
    const result = calculateScrollPercentages(1000, 3000, 1000, 0, 1000, 1000);
    assert.strictEqual(result.scrollYPercent, 0.5);
  });

  it('should calculate 100% when at the very bottom of document', () => {
    const result = calculateScrollPercentages(2000, 3000, 1000, 0, 1000, 1000);
    assert.strictEqual(result.scrollYPercent, 1.0);
  });

  it('should handle zero-overflow pages gracefully (content fits in viewport)', () => {
    const result = calculateScrollPercentages(0, 800, 800, 0, 500, 500);
    assert.strictEqual(result.scrollYPercent, 0);
    assert.strictEqual(result.scrollXPercent, 0);
    assert.strictEqual(result.maxScrollY, 0);
  });

  it('should reconstruct target scroll pixels accurately on follower with different height', () => {
    // Leader at 60% scroll
    const scrollYPercent = 0.6;
    const scrollXPercent = 0.0;

    // Follower viewport: targetScrollHeight: 4000, targetClientHeight: 1000 -> maxScroll = 3000
    const target = computeTargetScrollPixels(scrollYPercent, scrollXPercent, 4000, 1000, 500, 500);
    assert.strictEqual(target.targetTop, 1800); // 0.6 * 3000 = 1800
    assert.strictEqual(target.targetLeft, 0);
  });
});
