function createRendererRecoveryPolicy(options = {}) {
  const windowMs = Math.max(1000, Number(options.windowMs) || 60_000);
  const maximumAttempts = Math.max(1, Math.floor(Number(options.maximumAttempts) || 3));
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs) || 500);
  const histories = new Map();

  return {
    register(role, now = Date.now()) {
      const key = String(role || 'renderer');
      const recent = (histories.get(key) || []).filter(timestamp => now - timestamp < windowMs);
      if (recent.length >= maximumAttempts) {
        histories.set(key, recent);
        return { allowed: false, attempt: recent.length + 1, delayMs: 0 };
      }
      recent.push(now);
      histories.set(key, recent);
      return {
        allowed: true,
        attempt: recent.length,
        delayMs: Math.min(4000, baseDelayMs * (2 ** (recent.length - 1)))
      };
    }
  };
}

module.exports = { createRendererRecoveryPolicy };
