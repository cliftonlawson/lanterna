export function displayDomain(value: string) {
  return value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function absoluteUrl(value: string) {
  return /^https?:\/\//.test(value) ? value : `https://${value}`;
}

export function publicGalleryPath(slug: string) {
  return `/g/${encodeURIComponent(slug)}`;
}

export function publicGalleryUrl(base: string, slug: string) {
  return absoluteUrl(`${displayDomain(base)}${publicGalleryPath(slug)}`);
}

export function publicGalleryDisplayUrl(base: string, slug: string) {
  return `${displayDomain(base)}${publicGalleryPath(slug)}`;
}
