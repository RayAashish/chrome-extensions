import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createSyncEnvelope,
  isValidSyncEnvelope,
  MESSAGE_TYPES,
  PROTOCOL_VERSION
} from '../shared/protocol.js';

describe('Sync Protocol & Message Security', () => {
  const sampleToken = 'sec_token_abcdef123456';

  it('should create valid sync envelopes with proper metadata', () => {
    const env = createSyncEnvelope({
      type: MESSAGE_TYPES.SYNC_CLICK,
      sourceFrameId: 'frame-1',
      channelToken: sampleToken,
      sequence: 12,
      payload: { locator: { id: 'btn-submit' } }
    });

    assert.strictEqual(env.protocol, PROTOCOL_VERSION);
    assert.strictEqual(env.type, MESSAGE_TYPES.SYNC_CLICK);
    assert.strictEqual(env.sourceFrameId, 'frame-1');
    assert.strictEqual(env.channelToken, sampleToken);
    assert.strictEqual(env.sequence, 12);
    assert.strictEqual(env.isReplay, false);
    assert(env.timestamp > 0);
  });

  it('should validate legitimate envelope against expected channel token', () => {
    const env = createSyncEnvelope({
      type: MESSAGE_TYPES.SYNC_SCROLL,
      sourceFrameId: 'frame-1',
      channelToken: sampleToken,
      payload: { scrollYPercent: 0.45 }
    });

    assert.strictEqual(isValidSyncEnvelope(env, sampleToken), true);
  });

  it('should reject envelopes with spoofed or mismatched channel tokens', () => {
    const env = createSyncEnvelope({
      type: MESSAGE_TYPES.SYNC_INPUT,
      sourceFrameId: 'frame-evil',
      channelToken: 'forged_token_9999',
      payload: { value: 'hack' }
    });

    assert.strictEqual(isValidSyncEnvelope(env, sampleToken), false);
  });

  it('should reject malformed or non-protocol messages', () => {
    assert.strictEqual(isValidSyncEnvelope(null), false);
    assert.strictEqual(isValidSyncEnvelope({}), false);
    assert.strictEqual(isValidSyncEnvelope({ type: 'UNKNOWN_EVENT', protocol: PROTOCOL_VERSION }), false);
    assert.strictEqual(isValidSyncEnvelope({ type: MESSAGE_TYPES.SYNC_CLICK, protocol: '9.9.9' }), false);
  });

  it('should permit HANDSHAKE_INIT without an established channel token', () => {
    const handshakeMsg = {
      protocol: PROTOCOL_VERSION,
      type: MESSAGE_TYPES.HANDSHAKE_INIT,
      payload: { url: 'http://localhost:3000' }
    };

    assert.strictEqual(isValidSyncEnvelope(handshakeMsg, null), true);
  });
});
