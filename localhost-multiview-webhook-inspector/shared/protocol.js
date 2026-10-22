/**
 * Typed Synchronization & Messaging Protocol
 * Hub-and-Spoke communication contract between Workspace parent and Framed pages.
 */

export const PROTOCOL_VERSION = '1.0.0';

export const MESSAGE_TYPES = {
  // Handshake
  HANDSHAKE_INIT: 'LMVI_HANDSHAKE_INIT',
  HANDSHAKE_ACK: 'LMVI_HANDSHAKE_ACK',

  // Interaction Synchronization
  SYNC_SCROLL: 'LMVI_SYNC_SCROLL',
  SYNC_CLICK: 'LMVI_SYNC_CLICK',
  SYNC_INPUT: 'LMVI_SYNC_INPUT',
  SYNC_KEY: 'LMVI_SYNC_KEY',
  SYNC_NAV: 'LMVI_SYNC_NAV',
  SYNC_HOVER: 'LMVI_SYNC_HOVER',

  // Diagnostics & Feedback
  ELEMENT_NOT_FOUND: 'LMVI_ELEMENT_NOT_FOUND',
  OVERFLOW_REPORT: 'LMVI_OVERFLOW_REPORT',
  BREAKPOINT_UPDATE: 'LMVI_BREAKPOINT_UPDATE',

  // Settings & Configuration Updates (Workspace -> Frames)
  SETTINGS_UPDATE: 'LMVI_SETTINGS_UPDATE',
  REQUEST_OVERFLOW_CHECK: 'LMVI_REQUEST_OVERFLOW_CHECK',
  RELOAD_FRAME: 'LMVI_RELOAD_FRAME',
  INSPECT_ELEMENT_MODE: 'LMVI_INSPECT_ELEMENT_MODE',

  // Heartbeat
  PING: 'LMVI_PING',
  PONG: 'LMVI_PONG'
};

export const FRAME_MODES = {
  LEADER_FOLLOWER: 'sync',        // Bidirectional: leads when active, follows others
  LEADER_ONLY: 'lead',           // Only transmits, never receives
  FOLLOWER_ONLY: 'follow',       // Only receives, never transmits
  INDEPENDENT: 'independent'     // Fully isolated, no sync in or out
};

/**
 * Creates a typed synchronization message envelope
 */
export function createSyncEnvelope({
  type,
  sourceFrameId,
  channelToken,
  sequence = 0,
  payload = {},
  isReplay = false
}) {
  return {
    protocol: PROTOCOL_VERSION,
    type,
    sourceFrameId,
    channelToken,
    sequence,
    timestamp: Date.now(),
    isReplay,
    payload
  };
}

/**
 * Validates message format and channel security token
 */
export function isValidSyncEnvelope(data, expectedChannelToken = null) {
  if (!data || typeof data !== 'object') return false;
  if (!data.type || !Object.values(MESSAGE_TYPES).includes(data.type)) return false;
  if (data.protocol !== PROTOCOL_VERSION) return false;

  // Handshake init does not have a channelToken yet
  if (data.type === MESSAGE_TYPES.HANDSHAKE_INIT) {
    return true;
  }

  // If a channelToken is expected, enforce exact match
  if (expectedChannelToken && data.channelToken !== expectedChannelToken) {
    return false;
  }

  return true;
}

/**
 * Calculates scroll percentage based on scrollable document bounds
 * Returns normalized scroll position between 0.0 and 1.0
 */
export function calculateScrollPercentages(scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth) {
  const maxScrollY = Math.max(0, scrollHeight - clientHeight);
  const maxScrollX = Math.max(0, scrollWidth - clientWidth);

  const scrollYPercent = maxScrollY > 0 ? Math.min(1, Math.max(0, scrollTop / maxScrollY)) : 0;
  const scrollXPercent = maxScrollX > 0 ? Math.min(1, Math.max(0, scrollLeft / maxScrollX)) : 0;

  return {
    scrollYPercent,
    scrollXPercent,
    maxScrollY,
    maxScrollX
  };
}

/**
 * Reconstructs target scroll positions in pixels from normalized percentage
 */
export function computeTargetScrollPixels(scrollYPercent, scrollXPercent, targetScrollHeight, targetClientHeight, targetScrollWidth, targetClientWidth) {
  const maxScrollY = Math.max(0, targetScrollHeight - targetClientHeight);
  const maxScrollX = Math.max(0, targetScrollWidth - targetClientWidth);

  return {
    targetTop: Math.round(scrollYPercent * maxScrollY),
    targetLeft: Math.round(scrollXPercent * maxScrollX)
  };
}
