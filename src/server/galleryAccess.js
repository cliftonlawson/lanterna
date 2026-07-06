import { errorJson } from './http.js';

export function publicGalleryAccessError(gallery) {
  const now = Date.now();
  const accessExpiresAt = gallery.access_expires_at ? Date.parse(gallery.access_expires_at) : null;
  const extendedUntil = gallery.extended_until ? Date.parse(gallery.extended_until) : null;
  const accessExpired = accessExpiresAt && now > accessExpiresAt && !(gallery.is_extended && extendedUntil && now < extendedUntil);

  if (!['published', 'delivered'].includes(gallery.status)) return errorJson('Gallery not found.', 404);
  if (gallery.archived_at || gallery.deleted_at || accessExpired) return errorJson('Gallery not found.', 404);
  if (gallery.access_type === 'private') return errorJson('Gallery is private.', 403);
  return null;
}
