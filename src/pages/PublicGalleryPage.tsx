import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Lock, Music2, Pause, Play, RefreshCw, Share2, X } from 'lucide-react';
import {
  createPaidUnlockCheckout,
  confirmPaidUnlockRecovery,
  getPublicGallery,
  recordPublicGalleryActivity,
  type PaidUnlockSessionPayload,
  type PublicGalleryActivityType,
  type PublicGalleryPayload,
  recoverPaidUnlock,
  unlockPublicGallery,
  verifyPaidUnlockSession,
} from './lanterna-dashboard/appApi';
import { CustomVideoPlayer } from './lanterna-dashboard/CustomVideoPlayer';
import { LanternLogo } from '../components/LanternLogo';
import { GalleryMobilePreviewFrame, GalleryPreviewFrame, type PreviewFilm } from './lanterna-dashboard/GalleryStudioScreen';
import {
  defaultDeliveryDraft,
  defaultGalleryDesign,
  mediaTileGradients,
  type DashboardGallery,
  type GalleryDesign,
  type GalleryStatus,
  type MediaVideo,
  type WorkspaceAccount,
} from './lanterna-dashboard/model';
import { clampFontWeight, DEFAULT_BODY_WEIGHT, DEFAULT_HEADLINE_WEIGHT } from './lanterna-dashboard/fonts';
import { userMessage } from '../lib/userMessages';

type PublicGalleryPageProps = {
  slug: string;
};

type PublicState =
  | { status: 'loading' }
  | { error: string; status: 'error'; statusCode?: number }
  | { error?: string; galleryName: string; status: 'locked' }
  | { payload: PublicGalleryPayload; status: 'ready' };

export function PublicGalleryPage({ slug }: PublicGalleryPageProps) {
  const [state, setState] = useState<PublicState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    void getPublicGallery(slug).then((payload) => {
      if (!cancelled) setState({ payload, status: 'ready' });
    }).catch((error: Error & { payload?: unknown; status?: number }) => {
      if (cancelled) return;
      const payload = error.payload as { access?: string; gallery?: { name?: string } } | null;
      if (error.status === 401 && payload?.access === 'password_required') {
        setState({ galleryName: payload.gallery?.name ?? 'Private gallery', status: 'locked' });
        return;
      }
      setState({ error: userMessage(error, 'This gallery could not be loaded. Try again.'), status: 'error', statusCode: error.status });
    });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.status === 'loading') {
    return (
      <main className="public-gallery-page">
        <div className="public-gallery-state">
          <RefreshCw size={22} />
          <p>Loading gallery</p>
        </div>
      </main>
    );
  }

  if (state.status === 'error') {
    const locked = state.statusCode === 401 || state.statusCode === 403;
    return (
      <main className="public-gallery-page">
        <div className="public-gallery-state">
          {locked ? <Lock size={24} /> : <RefreshCw size={24} />}
          <h1>{locked ? 'Gallery locked' : 'Gallery unavailable'}</h1>
          <p>{state.error}</p>
        </div>
      </main>
    );
  }

  if (state.status === 'locked') {
    return (
      <main className="public-gallery-page">
        <PublicPasswordGate
          error={state.error}
          galleryName={state.galleryName}
          onUnlock={(payload) => setState({ payload, status: 'ready' })}
          slug={slug}
        />
      </main>
    );
  }

  return <PublicGalleryView payload={state.payload} />;
}

function PublicPasswordGate({
  error,
  galleryName,
  onUnlock,
  slug,
}: {
  error?: string;
  galleryName: string;
  onUnlock: (payload: PublicGalleryPayload) => void;
  slug: string;
}) {
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState(error ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = password.trim();
    if (!trimmed) {
      setSubmitError('Enter the gallery password.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      onUnlock(await unlockPublicGallery(slug, trimmed));
    } catch (unlockError) {
      setSubmitError(userMessage(unlockError, 'That password did not work. Try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="public-gallery-state public-password-form" onSubmit={onSubmit}>
      <Lock size={24} />
      <h1>{galleryName}</h1>
      <p>This gallery is password protected.</p>
      <label>
        <span>Password</span>
        <input
          autoComplete="current-password"
          autoFocus
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </label>
      {submitError && <em>{submitError}</em>}
      <button disabled={submitting} type="submit">{submitting ? 'Unlocking' : 'Unlock gallery'}</button>
    </form>
  );
}

function PublicGalleryView({ payload }: { payload: PublicGalleryPayload }) {
  const gallery = useMemo(() => publicPayloadToDashboardGallery(payload), [payload]);
  const workspace = useMemo(() => publicPayloadToWorkspace(payload), [payload]);
  const mobile = useMediaQuery('(max-width: 540px)');
  const [selectedFilm, setSelectedFilm] = useState<PreviewFilm | null>(null);
  const [lockedFilm, setLockedFilm] = useState<PreviewFilm | null>(null);
  const [copiedAction, setCopiedAction] = useState('');
  const [verifiedUnlocks, setVerifiedUnlocks] = useState<Record<string, PaidUnlockSessionPayload>>({});
  const [activitySessionId] = useState(() => publicGallerySessionId(payload.gallery.slug));
  const recordedActivity = useRef(new Set<string>());
  const recordActivity = useCallback((eventType: PublicGalleryActivityType, videoId?: string) => {
    const key = `${eventType}:${videoId || ''}`;
    if (recordedActivity.current.has(key)) return;
    recordedActivity.current.add(key);
    void recordPublicGalleryActivity(payload.gallery.slug, eventType, activitySessionId, videoId).catch(() => {
      recordedActivity.current.delete(key);
    });
  }, [activitySessionId, payload.gallery.slug]);
  const baseMediaUrls = useMemo(() => Object.fromEntries(
    Object.entries(payload.media ?? {}).map(([key, signed]) => [key, signed.url]),
  ), [payload.media]);
  const mediaUrls = useMemo(() => ({
    ...baseMediaUrls,
    ...Object.fromEntries(Object.values(verifiedUnlocks).flatMap((unlock) => Object.entries(unlock.media).map(([key, signed]) => [key, signed.url]))),
  }), [baseMediaUrls, verifiedUnlocks]);
  const musicUrl = gallery.design.musicTrackR2Key ? mediaUrls[gallery.design.musicTrackR2Key] ?? '' : '';
  const downloadUrls = useMemo(() => ({
    ...Object.fromEntries(Object.entries(payload.downloads ?? {}).map(([videoId, signed]) => [videoId, signed.url])),
    ...Object.fromEntries(Object.values(verifiedUnlocks).flatMap((unlock) => unlock.download ? [[unlock.videoId, unlock.download.url]] : [])),
  }), [payload.downloads, verifiedUnlocks]);
  const deliveredGallery = useMemo(() => ({
    ...gallery,
    videoItems: gallery.videoItems.map((video) => ({
      ...video,
      downloadEnabled: video.downloadEnabled && Boolean(downloadUrls[video.id]),
    })),
  }), [downloadUrls, gallery]);
  const streamPlayback = useMemo(() => ({
    ...(payload.stream ?? {}),
    ...Object.assign({}, ...Object.values(verifiedUnlocks).map((unlock) => unlock.stream ?? {})),
  }), [payload.stream, verifiedUnlocks]);
  const unlockedVideoIds = useMemo(() => new Set(Object.values(verifiedUnlocks).map((unlock) => unlock.videoId)), [verifiedUnlocks]);
  const applyPaidUnlock = useCallback((unlock: PaidUnlockSessionPayload) => {
    setVerifiedUnlocks((current) => ({ ...current, [unlock.videoId]: unlock }));
    const index = gallery.videoItems.findIndex((video) => video.id === unlock.videoId);
    if (index >= 0) setSelectedFilm(publicPreviewFilm(gallery.videoItems[index], index));
    setLockedFilm(null);
  }, [gallery.videoItems]);
  const selectFilm = (film: PreviewFilm) => {
    if (film.paidUnlockEnabled && (!film.sourceVideoId || !unlockedVideoIds.has(film.sourceVideoId))) {
      setLockedFilm(film);
      return;
    }
    setSelectedFilm(film);
  };

  useEffect(() => {
    recordActivity('opened');
  }, [recordActivity]);

  const runGalleryAction = (action: string) => {
    const galleryUrl = new URL(window.location.href);
    galleryUrl.searchParams.delete('film');
    galleryUrl.searchParams.delete('unlock_session');

    if (action === 'Share') {
      void navigator.clipboard?.writeText(galleryUrl.toString()).then(() => {
        setCopiedAction('Share');
        window.setTimeout(() => setCopiedAction(''), 1600);
      });
      return;
    }

    if (action === 'Embed') {
      const embed = `<iframe src="${galleryUrl.toString()}" title="${gallery.name}" allowfullscreen></iframe>`;
      void navigator.clipboard?.writeText(embed).then(() => {
        setCopiedAction('Embed');
        window.setTimeout(() => setCopiedAction(''), 1600);
      });
      return;
    }

    if (action !== 'Download') return;
    const video = gallery.videoItems.find((candidate) => {
      return candidate.downloadEnabled !== false && Boolean(downloadUrls[candidate.id]);
    });
    const downloadUrl = video ? downloadUrls[video.id] : '';
    if (!gallery.allowDownloads || !video || !downloadUrl) return;
    recordActivity('downloaded', video.id);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = video.title || gallery.name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get('unlock_session');
    if (!sessionId) return;

    let cancelled = false;
    void verifyPaidUnlockSession(payload.gallery.slug, sessionId).then((unlock) => {
      if (cancelled) return;
      applyPaidUnlock(unlock);
      url.searchParams.delete('unlock_session');
      window.history.replaceState({}, '', url.toString());
    }).catch(() => {
      if (cancelled) return;
      url.searchParams.delete('unlock_session');
      window.history.replaceState({}, '', url.toString());
    });

    return () => {
      cancelled = true;
    };
  }, [applyPaidUnlock, payload.gallery.slug]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('unlock_recovery');
    if (!token) return;
    let cancelled = false;
    void confirmPaidUnlockRecovery(payload.gallery.slug, token).then((unlock) => {
      if (!cancelled) applyPaidUnlock(unlock);
    }).catch(() => {
      // Invalid and expired links are removed without exposing purchase details.
    }).finally(() => {
      if (cancelled) return;
      url.searchParams.delete('unlock_recovery');
      window.history.replaceState({}, '', url.toString());
    });
    return () => { cancelled = true; };
  }, [applyPaidUnlock, payload.gallery.slug]);

  useEffect(() => {
    if (selectedFilm) return;
    const filmId = new URL(window.location.href).searchParams.get('film');
    if (!filmId) return;
    const index = gallery.videoItems.findIndex((video) => video.id === filmId);
    if (index < 0) return;
    const film = publicPreviewFilm(gallery.videoItems[index], index);
    if (film.paidUnlockEnabled && !unlockedVideoIds.has(film.sourceVideoId ?? '')) setLockedFilm(film);
    else setSelectedFilm(film);
  }, [gallery.videoItems, selectedFilm, unlockedVideoIds]);

  return (
    <main className={`public-gallery-page ${mobile ? 'is-mobile' : ''}`}>
      <section className="public-gallery-stage">
        {mobile ? (
          <GalleryMobilePreviewFrame actionLabels={{ Embed: copiedAction === 'Embed' ? 'Copied' : 'Embed', Share: copiedAction === 'Share' ? 'Copied' : 'Share' }} gallery={deliveredGallery} workspace={workspace} className="public-gallery-mobile" mediaUrls={mediaUrls} publicMode onAction={runGalleryAction} onFilmSelect={selectFilm} />
        ) : (
          <GalleryPreviewFrame actionLabels={{ Embed: copiedAction === 'Embed' ? 'Copied' : 'Embed', Share: copiedAction === 'Share' ? 'Copied' : 'Share' }} gallery={deliveredGallery} workspace={workspace} className="public-gallery-preview" crop mediaUrls={mediaUrls} publicMode onAction={runGalleryAction} onFilmSelect={selectFilm} />
        )}
      </section>
      {!workspace.whiteLabel && (
        <a className="public-gallery-attribution" href="https://lanterna.video" rel="noreferrer" target="_blank">
          <LanternLogo size={16} /> Powered by LANTERNA
        </a>
      )}
      {musicUrl && (
        <BackgroundMusic
          name={gallery.design.musicTrackName}
          suspended={Boolean(selectedFilm || lockedFilm)}
          url={musicUrl}
        />
      )}
      {selectedFilm && <PublicFilmPlayer downloadUrls={downloadUrls} film={selectedFilm} gallery={deliveredGallery} mediaUrls={mediaUrls} streamPlayback={streamPlayback} onClose={() => setSelectedFilm(null)} onDownload={(videoId) => recordActivity('downloaded', videoId)} onPlay={(videoId) => recordActivity('video_viewed', videoId)} />}
      {lockedFilm && <PublicPaidUnlockModal film={lockedFilm} gallery={gallery} onClose={() => setLockedFilm(null)} />}
    </main>
  );
}

function BackgroundMusic({ name, suspended, url }: { name: string; suspended: boolean; url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [requested, setRequested] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (suspended || !requested) {
      audio.pause();
      setPlaying(false);
      return;
    }

    void audio.play().then(() => setPlaying(true)).catch(() => {
      setRequested(false);
      setPlaying(false);
    });
  }, [requested, suspended, url]);

  return (
    <div className="public-gallery-music">
      <audio
        loop
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        preload="metadata"
        ref={audioRef}
        src={url}
      />
      <button
        aria-label={requested ? `Pause background music${name ? `: ${name}` : ''}` : `Play background music${name ? `: ${name}` : ''}`}
        aria-pressed={requested}
        onClick={() => setRequested((current) => !current)}
        title={name || 'Background music'}
        type="button"
      >
        <Music2 aria-hidden="true" size={16} />
        <span>{suspended && requested ? 'Music paused' : playing ? 'Pause music' : 'Play music'}</span>
        {playing ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} fill="currentColor" />}
      </button>
    </div>
  );
}

function publicPreviewFilm(video: MediaVideo, index: number): PreviewFilm {
  return {
    category: index === 0 ? 'FEATURE' : 'FULL',
    duration: video.duration,
    gradient: video.gradient,
    id: `${video.id}-public-link`,
    paidUnlockEnabled: video.paidUnlockEnabled,
    paidUnlockLabel: video.paidUnlockLabel,
    paidUnlockPriceCents: video.paidUnlockPriceCents,
    paidUnlockTagline: video.paidUnlockTagline,
    sourceVideoId: video.id,
    title: video.title,
    tone: index === 0 ? '#2F5586' : '#536F8F',
  };
}

function dollarsFromCents(cents: number | undefined) {
  return Math.max(0, Math.round((cents ?? 30000) / 100));
}

function PublicPaidUnlockModal({
  film,
  gallery,
  onClose,
}: {
  film: PreviewFilm;
  gallery: DashboardGallery;
  onClose: () => void;
}) {
  const price = dollarsFromCents(film.paidUnlockPriceCents);
  const label = film.paidUnlockLabel || film.title;
  const tagline = film.paidUnlockTagline || 'Unlock this bonus film to watch it inside the gallery.';
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverLoading, setRecoverLoading] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="public-player-backdrop public-unlock-backdrop" role="dialog" aria-modal="true" aria-label={`${label} unlock`}>
      <button className="public-player-scrim" aria-label="Close unlock" onClick={onClose} />
      <section className="public-unlock-panel">
        <div className="public-unlock-art still" style={{ ['--film-tone' as string]: film.tone, background: film.gradient }}>
          <span><Lock size={28} /></span>
        </div>
        <div className="public-unlock-body">
          <p>{gallery.name}</p>
          <h2>{label}</h2>
          <span>{tagline}</span>
          <div className="public-unlock-price">
            <strong>${price}</strong>
            <em>one-time unlock</em>
          </div>
          <button
            disabled={checkoutLoading}
            onClick={() => {
              if (!film.sourceVideoId) return;
              setCheckoutLoading(true);
              setCheckoutMessage('');
              void createPaidUnlockCheckout(gallery.id, film.sourceVideoId).then(({ checkoutUrl }) => {
                window.location.assign(checkoutUrl);
              }).catch((error) => {
                setCheckoutMessage(userMessage(error, 'Checkout could not start. Try again.'));
                setCheckoutLoading(false);
              });
            }}
          >
            {checkoutLoading ? 'Opening checkout' : `Unlock for $${price}`}
          </button>
          {checkoutMessage && <small className="public-unlock-note">{checkoutMessage}</small>}
          <small>Secure checkout opens in Stripe. The film unlocks automatically after payment.</small>
          <form
            className="public-unlock-recover"
            onSubmit={(event) => {
              event.preventDefault();
              if (!film.sourceVideoId) return;
              setRecoverLoading(true);
              setCheckoutMessage('');
              void recoverPaidUnlock(gallery.id, film.sourceVideoId, recoverEmail).then(({ message }) => {
                setCheckoutMessage(message);
              }).catch((error) => {
                setCheckoutMessage(userMessage(error, 'Recovery email could not be sent. Try again.'));
              }).finally(() => {
                setRecoverLoading(false);
              });
            }}
          >
            <label>
              <span>Already unlocked?</span>
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => setRecoverEmail(event.target.value)}
                placeholder="Email used at checkout"
                type="email"
                value={recoverEmail}
              />
            </label>
            <button disabled={recoverLoading} type="submit">{recoverLoading ? 'Checking' : 'Restore unlock'}</button>
          </form>
        </div>
        <button className="public-unlock-close" aria-label="Close unlock" onClick={onClose}><X size={20} /></button>
      </section>
    </div>
  );
}

function PublicFilmPlayer({
  downloadUrls,
  film,
  gallery,
  mediaUrls,
  streamPlayback,
  onClose,
  onDownload,
  onPlay,
}: {
  downloadUrls: Record<string, string>;
  film: PreviewFilm;
  gallery: DashboardGallery;
  mediaUrls: Record<string, string>;
  streamPlayback: NonNullable<PublicGalleryPayload['stream']>;
  onClose: () => void;
  onDownload: (videoId: string) => void;
  onPlay: (videoId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const sourceVideo = gallery.videoItems.find((video) => video.id === film.sourceVideoId) ?? gallery.videoItems.find((video) => video.title === film.title);
  const playbackKey = sourceVideo?.webCopyR2Key || sourceVideo?.r2Key || null;
  const playbackUrl = playbackKey ? mediaUrls[playbackKey] : '';
  const stream = sourceVideo?.streamUid ? streamPlayback[sourceVideo.streamUid] : null;
  const posterUrl = sourceVideo?.posterR2Key && !/\.tiff?($|\?)/i.test(sourceVideo.posterR2Key) ? mediaUrls[sourceVideo.posterR2Key] : stream?.thumbnailUrl ?? '';
  const streamUrl = stream?.iframeUrl ?? '';
  const downloadUrl = sourceVideo ? downloadUrls[sourceVideo.id] : '';
  const downloadAllowed = Boolean(sourceVideo?.downloadEnabled !== false && downloadUrl);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const copyShareLink = () => {
    const url = new URL(window.location.href);
    if (film.sourceVideoId) url.searchParams.set('film', film.sourceVideoId);
    void navigator.clipboard?.writeText(url.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="public-player-backdrop" role="dialog" aria-modal="true" aria-label={`${film.title} player`}>
      <button className="public-player-scrim" aria-label="Close player" onClick={onClose} />
      <section className="public-player-panel">
        <CustomVideoPlayer
          className="public-player-hero"
          durationSeconds={durationSecondsFromLabel(film.duration)}
          fallbackBackground={film.gradient}
          posterUrl={posterUrl}
          onPlay={() => {
            if (sourceVideo) onPlay(sourceVideo.id);
          }}
          streamUrl={streamUrl}
          title={film.title}
          videoUrl={playbackUrl}
        />
        <div className="public-player-body">
          <div>
            <p>{gallery.name}</p>
            <h2>{film.title}</h2>
            <span>{film.category} · {film.duration}</span>
          </div>
          <div className="public-player-actions">
            <button onClick={copyShareLink}><Share2 size={17} /> {copied ? 'Copied' : 'Share'}</button>
            <a aria-disabled={!downloadAllowed} className={!downloadAllowed ? 'is-disabled' : ''} href={downloadAllowed ? downloadUrl : undefined} download onClick={() => {
              if (downloadAllowed && sourceVideo) onDownload(sourceVideo.id);
            }}>
              <Download size={17} /> Download
            </a>
            <button aria-label="Close player" onClick={onClose}><X size={20} /></button>
          </div>
        </div>
      </section>
    </div>
  );
}

function durationSecondsFromLabel(duration: string | undefined) {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  return parts.reduce((seconds, part) => seconds * 60 + part, 0);
}

function publicGallerySessionId(slug: string) {
  const storageKey = `lanterna_gallery_session:${slug}`;
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) return stored;
    const created = crypto.randomUUID().replace(/-/g, '_');
    window.sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
  }
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' ? window.matchMedia(query).matches : false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const sync = () => setMatches(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

function publicPayloadToWorkspace(payload: PublicGalleryPayload): WorkspaceAccount {
  return {
    accountId: null,
    allowanceTotalGb: 0,
    allowanceUsedGb: 0,
    accentColor: payload.workspace.accentColor,
    coldBytesStored: 0,
    customDomain: payload.workspace.customDomain,
    defaultDownloads: true,
    hotBytesStored: 0,
    studioName: payload.workspace.studioName,
    streamMinutesStored: 0,
    tagline: payload.workspace.tagline ?? '',
    whiteLabel: payload.workspace.whiteLabel,
    userEmail: '',
    userName: '',
  };
}

function publicPayloadToDashboardGallery(payload: PublicGalleryPayload): DashboardGallery {
  const design = publicDesign(payload.gallery.design, payload.gallery.name);
  const videos = payload.gallery.videos.map(publicVideo);
  return {
    access: payload.gallery.accessType === 'public' ? 'Public' : payload.gallery.accessType === 'password' ? 'Password' : 'Private',
    albums: [],
    allowDownloads: payload.gallery.allowDownloads !== false,
    archived: false,
    autoExpire: false,
    client: payload.gallery.clientName ?? payload.gallery.name,
    coverChosen: videos.length > 0,
    date: shortDate(payload.gallery.eventDate),
    deliveryDraft: defaultDeliveryDraft(),
    design,
    gradient: design.backgroundGradient,
    id: payload.gallery.slug,
    slug: payload.gallery.slug,
    name: payload.gallery.name,
    passwordSet: payload.gallery.accessType === 'password',
    photoItems: payload.gallery.photos.map((photo, index) => ({
      albumId: typeof photo.album_id === 'string' ? photo.album_id : null,
      aspectRatio: '4/3',
      gradient: mediaTileGradients[index % mediaTileGradients.length],
      id: String(photo.id ?? `photo-${index}`),
      processingStatus: 'ready',
      r2Key: typeof photo.r2_key === 'string' ? photo.r2_key : null,
    })),
    photos: payload.gallery.photos.length,
    project: payload.gallery.projectType === 'engagement' ? 'Engagements' : payload.gallery.projectType === 'portrait' ? 'Portraits' : 'Weddings',
    recipients: [],
    status: publicStatus(payload.gallery.status),
    videoItems: videos,
    videos: videos.length,
    views: '0',
  };
}

function publicDesign(rawDesign: Record<string, unknown> | null, fallbackTitle: string): GalleryDesign {
  const defaults = defaultGalleryDesign(fallbackTitle);
  const headlineFont = text(rawDesign?.headline_font) || defaults.headlineFont;
  const bodyFont = text(rawDesign?.body_font) || defaults.bodyFont;
  const enabledButtons = rawDesign?.enabled_buttons && typeof rawDesign.enabled_buttons === 'object' && !Array.isArray(rawDesign.enabled_buttons)
    ? rawDesign.enabled_buttons as Record<string, unknown>
    : null;

  return {
    ...defaults,
    accent: text(rawDesign?.accent_color) || defaults.accent,
    backgroundGradient: text(rawDesign?.background_gradient) || text(enabledButtons?.backgroundGradient) || defaults.backgroundGradient,
    backgroundR2Key: text(rawDesign?.background_r2_key) || null,
    backgroundType: rawDesign?.background_type === 'video' ? 'video' : 'image',
    bodyFont,
    bodyFontWeight: clampFontWeight(bodyFont, number(rawDesign?.body_font_weight), DEFAULT_BODY_WEIGHT),
    eyebrow: text(rawDesign?.heading_eyebrow),
    headlineFont,
    headlineFontWeight: clampFontWeight(headlineFont, number(rawDesign?.headline_font_weight), DEFAULT_HEADLINE_WEIGHT),
    layout: layoutValue(rawDesign?.layout_template) ?? defaults.layout,
    musicTrackName: text(rawDesign?.music_track_name),
    musicTrackR2Key: text(rawDesign?.music_track_r2_key) || null,
    subtitle: text(rawDesign?.heading_subtitle),
    theme: rawDesign?.theme === 'light' ? 'light' : 'dark',
    title: text(rawDesign?.heading_title) || fallbackTitle,
    topButtons: {
      download: buttonEnabled(rawDesign, 'download', true),
      embed: buttonEnabled(rawDesign, 'embed', false),
      share: buttonEnabled(rawDesign, 'share', true),
    },
    typography: rawDesign?.typography === 'modern' ? 'modern' : 'editorial',
  };
}

function publicVideo(video: Record<string, unknown>, index: number): MediaVideo {
  return {
    downloadEnabled: video.download_enabled !== false,
    duration: durationLabel(number(video.duration_seconds)),
    gradient: mediaTileGradients[index % mediaTileGradients.length],
    id: String(video.id ?? `video-${index}`),
    posterR2Key: text(video.poster_r2_key) || null,
    paidUnlockEnabled: video.paid_unlock_enabled === true,
    paidUnlockLabel: text(video.paid_unlock_label) || undefined,
    paidUnlockPriceCents: number(video.paid_unlock_price_cents) ?? 30000,
    paidUnlockTagline: text(video.paid_unlock_tagline) || undefined,
    processingStatus: video.processing_status === 'uploading' || video.processing_status === 'processing' || video.processing_status === 'errored' ? video.processing_status : 'ready',
    r2Bytes: 0,
    r2Key: text(video.r2_key) || text(video.web_copy_r2_key) || null,
    streamReady: video.stream_ready !== false,
    streamUid: text(video.stream_uid) || null,
    title: text(video.title) || `Film ${index + 1}`,
    updatedAt: 'Public gallery',
    visibleInGallery: video.visible_in_gallery !== false,
    webCopyR2Key: text(video.web_copy_r2_key) || null,
    tags: [],
  };
}

function buttonEnabled(rawDesign: Record<string, unknown> | null, key: string, fallback: boolean) {
  const buttons = rawDesign?.enabled_buttons;
  if (!buttons || typeof buttons !== 'object' || Array.isArray(buttons)) return fallback;
  const value = (buttons as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : fallback;
}

function durationLabel(seconds: number | null) {
  if (!seconds || seconds < 1) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function layoutValue(value: unknown): GalleryDesign['layout'] | null {
  const layouts: GalleryDesign['layout'][] = ['lumen', 'diptych', 'meridian', 'grove', 'atelier', 'reel', 'overture', 'passage', 'salon'];
  return layouts.includes(value as GalleryDesign['layout']) ? value as GalleryDesign['layout'] : null;
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function publicStatus(value: string): GalleryStatus {
  if (value === 'published' || value === 'delivered') return value;
  return 'draft';
}

function shortDate(value: string | null) {
  if (!value) return 'Just now';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
