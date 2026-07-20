import assert from 'node:assert/strict';
import { contactSupport } from '../src/server/lanternaApi.js';

const originalFetch = globalThis.fetch;
let rateLimitAllowed = true;
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes('/rest/v1/rpc/consume_public_rate_limit')) {
    return new Response(JSON.stringify(rateLimitAllowed), { headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unhandled request: ${url}`);
};

const env = {
  CONTACT_EMAIL: 'team@hellobower.com',
  EMAIL_PROVIDER: 'mock',
  EMAIL_REPLY_TO: 'team@hellobower.com',
  SUPABASE_SERVICE_ROLE_KEY: 'service_test',
  SUPABASE_URL: 'https://supabase.example',
};

try {
  const sent = await contactSupport(contactRequest({
    email: 'filmmaker@example.com',
    message: 'I need help with a gallery delivery.',
    name: 'Jordan Lee',
    subject: 'Gallery question',
  }), env);
  assert.equal(sent.status, 200);
  assert.equal((await sent.json()).ok, true);

  const invalid = await contactSupport(contactRequest({
    email: 'not-an-email',
    message: 'Too short',
    name: 'J',
  }), env);
  assert.equal(invalid.status, 422);

  rateLimitAllowed = false;
  const limited = await contactSupport(contactRequest({
    email: 'filmmaker@example.com',
    message: 'I need help with another gallery delivery.',
    name: 'Jordan Lee',
  }), env);
  assert.equal(limited.status, 429);

  const honeypot = await contactSupport(contactRequest({
    email: 'bot@example.com',
    message: 'Spam message that should not be delivered.',
    name: 'Bot User',
    website: 'https://spam.example',
  }), env);
  assert.equal(honeypot.status, 200);

  console.log('public contact form validation, rate limit, and send checks passed');
} finally {
  globalThis.fetch = originalFetch;
}

function contactRequest(body) {
  return new Request('https://lanterna.video/api/contact', {
    body: JSON.stringify(body),
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'content-type': 'application/json',
    },
    method: 'POST',
  });
}
