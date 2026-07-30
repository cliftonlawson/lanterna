import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';

type StreamPlayer = {
  addEventListener: (type: string, listener: () => void) => void;
  controls: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  pause: () => void;
  play: () => Promise<void>;
  volume: number;
};

declare global {
  interface Window {
    Stream?: (iframe: HTMLIFrameElement) => StreamPlayer;
  }
}

type Props = {
  className?: string;
  durationSeconds?: number;
  fallbackBackground?: string;
  onPlay?: () => void;
  onTimeChange?: (seconds: number) => void;
  posterUrl?: string;
  streamUrl?: string;
  title: string;
  videoUrl?: string;
};

let streamSdkPromise: Promise<void> | null = null;

export function CustomVideoPlayer({ className = '', durationSeconds = 0, fallbackBackground, onPlay, onTimeChange, posterUrl, streamUrl, title, videoUrl }: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<StreamPlayer | null>(null);
  const mutedRef = useRef(true);
  const onPlayRef = useRef(onPlay);
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const knownDuration = finiteMediaTime(durationSeconds);
  const [duration, setDuration] = useState(knownDuration);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const hasPlayableSource = Boolean(streamUrl || videoUrl);
  const iframeSrc = useMemo(() => streamUrl && !streamFailed && active ? streamIframeSrc(streamUrl, posterUrl) : '', [active, posterUrl, streamFailed, streamUrl]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    onPlayRef.current = onPlay;
  }, [onPlay]);

  useEffect(() => {
    onTimeChange?.(currentTime);
  }, [currentTime, onTimeChange]);

  useEffect(() => {
    setActive(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(knownDuration);
    setStreamFailed(false);
    playerRef.current = null;
  }, [knownDuration, streamUrl, videoUrl]);

  useEffect(() => {
    const syncFullscreen = () => {
      const fullscreenElement = fullscreenElementFor(document);
      setFullscreen(fullscreenElement === wrapperRef.current);
      if (fullscreenElement === wrapperRef.current) setExpanded(false);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, []);

  useEffect(() => {
    if (!active || !iframeSrc || !iframeRef.current) return undefined;

    let cancelled = false;
    let removeTick: number | null = null;

    const failStream = () => {
      if (cancelled) return;
      playerRef.current = null;
      if (videoUrl) {
        setStreamFailed(true);
      } else {
        setActive(false);
      }
      setPlaying(false);
    };

    void loadStreamSdk().then(() => {
      if (cancelled || !iframeRef.current || !window.Stream) return;
      const player = window.Stream(iframeRef.current);
      player.controls = false;
      player.muted = mutedRef.current;
      playerRef.current = player;

      const sync = () => {
        setCurrentTime(finiteMediaTime(player.currentTime));
        const playerDuration = finiteMediaTime(player.duration);
        if (playerDuration > 0) setDuration(playerDuration);
        else if (knownDuration > 0) setDuration((current) => current > 0 ? current : knownDuration);
        setMuted(Boolean(player.muted));
      };
      const markPlaying = () => {
        setPlaying(true);
        onPlayRef.current?.();
        sync();
      };
      const markPaused = () => {
        setPlaying(false);
        sync();
      };

      player.addEventListener('loadedmetadata', sync);
      player.addEventListener('loadeddata', sync);
      player.addEventListener('canplay', sync);
      player.addEventListener('durationchange', sync);
      player.addEventListener('timeupdate', sync);
      player.addEventListener('volumechange', sync);
      player.addEventListener('play', markPlaying);
      player.addEventListener('playing', markPlaying);
      player.addEventListener('pause', markPaused);
      player.addEventListener('error', failStream);
      player.addEventListener('ended', () => {
        setPlaying(false);
        setCurrentTime(0);
      });

      void player.play().then(markPlaying).catch(() => {
        player.muted = true;
        setMuted(true);
        void player.play().then(markPlaying).catch(failStream);
      });

      removeTick = window.setInterval(sync, 500);
    }).catch(failStream);

    return () => {
      cancelled = true;
      if (removeTick) window.clearInterval(removeTick);
      playerRef.current = null;
    };
  }, [active, iframeSrc, knownDuration, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return undefined;

    const sync = () => {
      setCurrentTime(finiteMediaTime(video.currentTime));
      const videoDuration = finiteMediaTime(video.duration);
      if (videoDuration > 0) setDuration(videoDuration);
      else if (knownDuration > 0) setDuration((current) => current > 0 ? current : knownDuration);
      setMuted(video.muted);
    };
    const markPlaying = () => {
      setPlaying(true);
      onPlayRef.current?.();
      sync();
    };
    const markPaused = () => {
      setPlaying(false);
      sync();
    };

    video.muted = mutedRef.current;
    video.addEventListener('loadedmetadata', sync);
    video.addEventListener('durationchange', sync);
    video.addEventListener('timeupdate', sync);
    video.addEventListener('volumechange', sync);
    video.addEventListener('play', markPlaying);
    video.addEventListener('playing', markPlaying);
    video.addEventListener('pause', markPaused);
    video.addEventListener('ended', markPaused);
    void video.play().then(markPlaying).catch(() => {
      video.muted = true;
      setMuted(true);
      void video.play().then(markPlaying).catch(markPaused);
    });

    return () => {
      video.pause();
      video.removeEventListener('loadedmetadata', sync);
      video.removeEventListener('durationchange', sync);
      video.removeEventListener('timeupdate', sync);
      video.removeEventListener('volumechange', sync);
      video.removeEventListener('play', markPlaying);
      video.removeEventListener('playing', markPlaying);
      video.removeEventListener('pause', markPaused);
      video.removeEventListener('ended', markPaused);
    };
  }, [active, knownDuration, videoUrl]);

  const play = () => {
    if (!hasPlayableSource) return;
    if (!active) {
      setActive(true);
      return;
    }

    const player = playerRef.current;
    const video = videoRef.current;
    if (player) void player.play().then(() => setPlaying(true));
    else if (video) void video.play().then(() => setPlaying(true));
  };

  const pause = () => {
    playerRef.current?.pause();
    videoRef.current?.pause();
    setPlaying(false);
  };

  const seek = (value: string) => {
    const nextTime = Number(value);
    if (!Number.isFinite(nextTime)) return;
    if (playerRef.current) playerRef.current.currentTime = nextTime;
    if (videoRef.current) videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const skipBack = () => seek(String(Math.max(currentTime - 10, 0)));

  const revealControls = () => {
    setInteracting(true);
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    if (playerRef.current) playerRef.current.muted = nextMuted;
    if (videoRef.current) videoRef.current.muted = nextMuted;
    setMuted(nextMuted);
  };

  const toggleFullscreen = async () => {
    const fullscreenElement = fullscreenElementFor(document);
    if (fullscreenElement === wrapperRef.current) {
      await exitFullscreen(document);
      return;
    }

    if (expanded) {
      setExpanded(false);
      return;
    }

    if (wrapperRef.current && await requestFullscreen(wrapperRef.current)) return;
    setExpanded(true);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={wrapperRef}
      className={`custom-video-player ${className} ${active ? 'is-active' : 'is-poster'} ${fullscreen || expanded ? 'is-expanded' : ''} ${interacting ? 'is-interacting' : ''}`}
      onBlur={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      style={fallbackBackground ? { background: fallbackBackground } : undefined}
    >
      {active && iframeSrc ? (
        <iframe
          ref={iframeRef}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
          src={iframeSrc}
          title={title}
        />
      ) : active && videoUrl ? (
        <video ref={videoRef} playsInline poster={posterUrl || undefined} src={videoUrl} />
      ) : (
        <>
          {posterUrl && <img className="media-poster-image" alt="" src={posterUrl} />}
          <button className="custom-video-center-play" aria-label={`Play ${title}`} disabled={!hasPlayableSource} onClick={play}>
            <span className="custom-video-play-glyph" aria-hidden="true" />
          </button>
        </>
      )}

      {active && (
        <div
          className="custom-video-hover-catcher"
          aria-hidden="true"
          onClick={revealControls}
          onMouseMove={revealControls}
          onTouchStart={revealControls}
        />
      )}

      {active && (fullscreen || expanded) && (
        <button
          aria-label="Exit fullscreen video"
          className="custom-video-fullscreen-exit"
          onClick={() => void toggleFullscreen()}
          type="button"
        >
          <Minimize2 size={20} />
          <span>Exit fullscreen</span>
        </button>
      )}

      {active && (
        <div className="custom-video-controls" aria-label={`${title} controls`}>
          <input
            aria-label="Seek video"
            className="custom-video-seek"
            max={Math.max(duration, 1)}
            min={0}
            onChange={(event) => seek(event.currentTarget.value)}
            style={{ ['--progress' as string]: `${progress}%` }}
            type="range"
            value={Math.min(currentTime, Math.max(duration, 1))}
          />
          <div className="custom-video-control-row">
            <button aria-label={playing ? 'Pause video' : 'Play video'} onClick={playing ? pause : play}>
              {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
            </button>
            <button aria-label="Back 10 seconds" onClick={skipBack}>
              <RotateCcw size={21} />
              <small>10</small>
            </button>
            <button aria-label={muted ? 'Unmute video' : 'Mute video'} onClick={toggleMute}>
              {muted ? <VolumeX size={25} /> : <Volume2 size={25} />}
            </button>
            <span className="custom-video-time">{formatTime(currentTime)} <b>/</b> {formatTime(duration)}</span>
            <span className="custom-video-spacer" />
            <button aria-label={fullscreen || expanded ? 'Exit fullscreen video' : 'Fullscreen video'} onClick={() => void toggleFullscreen()}>
              {fullscreen || expanded ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fullscreenElementFor(documentRef: Document) {
  return documentRef.fullscreenElement
    ?? (documentRef as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement
    ?? null;
}

async function requestFullscreen(element: HTMLDivElement) {
  const request = element.requestFullscreen
    ?? (element as HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }).webkitRequestFullscreen
    ?? (element as HTMLDivElement & { webkitRequestFullScreen?: () => Promise<void> | void }).webkitRequestFullScreen;
  if (!request) return false;
  try {
    await request.call(element);
    return true;
  } catch {
    return false;
  }
}

function exitFullscreen(documentRef: Document) {
  const exit = documentRef.exitFullscreen
    ?? (documentRef as Document & { webkitExitFullscreen?: () => Promise<void> | void }).webkitExitFullscreen;
  if (exit) return exit.call(documentRef);
  return undefined;
}

function streamIframeSrc(iframeUrl: string, posterUrl?: string) {
  try {
    const url = new URL(iframeUrl);
    url.searchParams.set('autoplay', 'true');
    url.searchParams.set('muted', 'true');
    url.searchParams.set('controls', 'false');
    if (posterUrl) url.searchParams.set('poster', posterUrl);
    return url.toString();
  } catch {
    const separator = iframeUrl.includes('?') ? '&' : '?';
    return `${iframeUrl}${separator}autoplay=true&muted=true&controls=false`;
  }
}

function loadStreamSdk() {
  if (window.Stream) return Promise.resolve();
  if (streamSdkPromise) return streamSdkPromise;

  streamSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://embed.cloudflarestream.com/embed/sdk.latest.js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Cloudflare Stream SDK failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://embed.cloudflarestream.com/embed/sdk.latest.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Cloudflare Stream SDK failed to load.'));
    document.head.appendChild(script);
  });

  return streamSdkPromise;
}

function formatTime(seconds: number) {
  const safeSeconds = Math.floor(finiteMediaTime(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function finiteMediaTime(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}
