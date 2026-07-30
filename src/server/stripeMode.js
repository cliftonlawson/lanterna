export function stripeLiveMode(env = {}) {
  const key = String(env.STRIPE_SECRET_KEY || '').trim();
  return key.startsWith('sk_live_') || key.startsWith('rk_live_');
}

export function stripeSandboxWritesEnabled(env = {}) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(env.STRIPE_SANDBOX_WRITES_ENABLED || '').trim().toLowerCase(),
  );
}

export function stripeMutationsEnabled(env = {}) {
  return stripeLiveMode(env) || stripeSandboxWritesEnabled(env);
}
