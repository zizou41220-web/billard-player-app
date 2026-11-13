/**
 * Utility functions for video streaming, embed URLs and parsing
 * Supports YouTube, Facebook, Twitch, VDO.Ninja, and IP cameras.
 */

export const extractExternalVideoFromStreamUrl = (streamUrl?: string): string => {
  if (!streamUrl) return '';
  try {
    const qIdx = streamUrl.indexOf('?');
    if (qIdx !== -1 && streamUrl.includes('overlay=')) {
      const params = new URLSearchParams(streamUrl.slice(qIdx));
      return params.get('video') || '';
    }
  } catch {}
  if (!streamUrl.includes('overlay=')) {
    return streamUrl;
  }
  return '';
};

export const extractVdoRoomFromStreamUrl = (streamUrl?: string): string => {
  if (!streamUrl) return '';
  try {
    const qIdx = streamUrl.indexOf('?');
    if (qIdx !== -1 && streamUrl.includes('vdo=')) {
      const params = new URLSearchParams(streamUrl.slice(qIdx));
      return params.get('vdo') || '';
    }
  } catch {}
  return '';
};

/**
 * Transforms any YouTube, Facebook, Twitch or direct URL into an embeddable iframe URL.
 * Supports:
 * - youtube.com/watch?v=VIDEO_ID (with any query params in any order)
 * - youtu.be/VIDEO_ID
 * - youtube.com/live/VIDEO_ID
 * - youtube.com/embed/VIDEO_ID
 * - youtube.com/shorts/VIDEO_ID
 * - youtube.com/channel/CHANNEL_ID/live
 * - Raw <iframe> code pasted by user
 * - facebook.com / fb.watch
 * - twitch.tv
 */
export const formatEmbedVideoUrl = (rawUrl: string): string => {
  if (!rawUrl) return '';
  let url = rawUrl.trim();

  // If user pasted an entire iframe snippet: <iframe ... src="..." ...>
  if (url.includes('<iframe') && url.includes('src=')) {
    const srcMatch = url.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      url = srcMatch[1];
    }
  }

  // Remove HTML entity escapes
  url = url.replace(/&amp;/g, '&');

  // YouTube Parsing
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    // 1. Check for ?v= or &v= anywhere in URL (handles any query string ordering)
    const vMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (vMatch && vMatch[1]) {
      return `https://www.youtube-nocookie.com/embed/${vMatch[1]}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1`;
    }

    // 2. Check for youtu.be/ID, youtube.com/live/ID, youtube.com/embed/ID, youtube.com/shorts/ID
    const pathMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:live|embed|shorts)\/)([a-zA-Z0-9_-]{11})/);
    if (pathMatch && pathMatch[1]) {
      return `https://www.youtube-nocookie.com/embed/${pathMatch[1]}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1`;
    }

    // 3. YouTube Channel Live (e.g. youtube.com/channel/UC.../live)
    const channelMatch = url.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
    if (channelMatch && channelMatch[1]) {
      return `https://www.youtube-nocookie.com/embed/live_stream?channel=${channelMatch[1]}&autoplay=1&mute=1&playsinline=1&rel=0`;
    }

    // 4. If already an embed URL
    if (url.includes('/embed/')) {
      const glue = url.includes('?') ? '&' : '?';
      return `${url}${glue}autoplay=1&mute=1&playsinline=1&rel=0`;
    }
  }

  // Facebook Parsing
  if (url.includes('facebook.com') || url.includes('fb.watch')) {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&autoplay=1&mute=1&show_text=0`;
  }

  // Twitch Parsing
  if (url.includes('twitch.tv')) {
    const twitchMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    if (twitchMatch && twitchMatch[1]) {
      const parentDomain = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      return `https://player.twitch.tv/?channel=${twitchMatch[1]}&parent=${parentDomain}&autoplay=true&muted=true`;
    }
  }

  return url;
};

