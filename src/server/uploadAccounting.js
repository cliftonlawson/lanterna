export const BYTES_PER_GB = 1_000_000_000;

export class UploadVerificationError extends Error {
  constructor(message, { code, expectedBytes = null, verifiedBytes = null } = {}) {
    super(message);
    this.name = 'UploadVerificationError';
    this.code = code || 'upload_verification_failed';
    this.expectedBytes = expectedBytes;
    this.verifiedBytes = verifiedBytes;
  }
}

export function bytesToGb(bytes) {
  const value = Number(bytes || 0);
  return Number.isFinite(value) && value > 0 ? value / BYTES_PER_GB : 0;
}

export function verifyDirectR2Object(job, object) {
  if (!object?.exists) {
    throw new UploadVerificationError('R2 upload verification failed: object was not found.', {
      code: 'upload_object_missing',
    });
  }

  const expectedBytes = Number(job?.bytes_total || 0);
  const verifiedBytes = Number(object.bytes || 0);
  if (!Number.isSafeInteger(verifiedBytes) || verifiedBytes <= 0 || verifiedBytes !== expectedBytes) {
    throw new UploadVerificationError('R2 upload verification failed: object size does not match the reserved upload.', {
      code: 'upload_size_mismatch',
      expectedBytes,
      verifiedBytes,
    });
  }

  const expectedContentType = String(job?.content_type || '').trim().toLowerCase();
  const verifiedContentType = String(object.contentType || '').trim().toLowerCase();
  if (expectedContentType && expectedContentType !== verifiedContentType) {
    throw new UploadVerificationError('R2 upload verification failed: content type does not match the upload slot.', {
      code: 'upload_content_type_mismatch',
      expectedBytes,
      verifiedBytes,
    });
  }

  return {
    contentType: verifiedContentType,
    verifiedBytes,
  };
}
