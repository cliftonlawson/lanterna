function explicitBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

export function resolveGalleryDownloadPermission(galleryAllowDownloads, vendorDefaultDownloads) {
  return explicitBoolean(galleryAllowDownloads)
    ?? explicitBoolean(vendorDefaultDownloads)
    ?? true;
}

export function resolveVideoDownloadPermission(videoDownloadEnabled, galleryAllowDownloads, vendorDefaultDownloads) {
  return explicitBoolean(videoDownloadEnabled)
    ?? resolveGalleryDownloadPermission(galleryAllowDownloads, vendorDefaultDownloads);
}
