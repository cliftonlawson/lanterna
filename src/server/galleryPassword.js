const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_PREFIX = 'pbkdf2-sha256';

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  return new Uint8Array(value.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function sha256Bytes(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function pbkdf2Bytes(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return new Uint8Array(await crypto.subtle.deriveBits({
    hash: 'SHA-256',
    iterations,
    name: 'PBKDF2',
    salt,
  }, key, 256));
}

export function normalizeGalleryPassword(password) {
  return String(password || '').trim();
}

export function supportedGalleryPasswordHash(value) {
  const stored = String(value || '');
  return stored.startsWith(`${PBKDF2_PREFIX}:`) || stored.startsWith('sha256:');
}

export async function hashGalleryPassword(password) {
  const normalized = normalizeGalleryPassword(password);
  if (!normalized) throw new Error('Set a gallery password.');
  if (normalized.length > 200) throw new Error('Gallery passwords must be 200 characters or fewer.');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Bytes(normalized, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}:${PBKDF2_ITERATIONS}:${bytesToHex(salt)}:${bytesToHex(hash)}`;
}

export async function verifyGalleryPassword(password, storedHash) {
  const normalized = normalizeGalleryPassword(password);
  const stored = String(storedHash || '');
  if (!normalized || !supportedGalleryPasswordHash(stored)) return false;

  if (stored.startsWith(`${PBKDF2_PREFIX}:`)) {
    const [, iterationValue, saltValue, hashValue] = stored.split(':');
    const iterations = Number(iterationValue);
    const salt = hexToBytes(saltValue || '');
    const expected = hexToBytes(hashValue || '');
    if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 || !salt || salt.length < 16 || !expected) return false;
    return constantTimeEqual(await pbkdf2Bytes(normalized, salt, iterations), expected);
  }

  const [, saltValue, hashValue] = stored.split(':');
  const expected = hexToBytes(hashValue || '');
  if (!saltValue || !expected) return false;
  return constantTimeEqual(await sha256Bytes(`${saltValue}:${normalized}`), expected);
}
