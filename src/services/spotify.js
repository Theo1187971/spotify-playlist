// ============================================
// Spotify Web API Service
// ============================================
import { SPOTIFY_API_BASE } from '../config';
import { getAccessToken, refreshAccessToken, isTokenExpired } from './auth';

// --- Helpers ---
const isDev = import.meta.env.DEV;

// --- Global Rate Limit Guard ---
// Tracks last Retry-After so ALL requests wait until the cooldown is over
let blockedUntil = 0;   // timestamp (ms) until which we must not send requests
let lastCallTime = 0;
const MIN_DELAY_MS = 150; // min gap between any two calls
const MAX_WAIT_S = 60;    // if Retry-After exceeds this, stop entirely

async function waitForRateLimit() {
  // 1. Check global cooldown from a previous 429
  const now = Date.now();
  const remaining = blockedUntil - now;
  if (remaining > 0) {
    if (remaining > MAX_WAIT_S * 1000) {
      throw new Error(
        `Limite Spotify atteinte. Réessayez dans ${Math.ceil(remaining / 1000)} secondes.`
      );
    }
    if (isDev) console.warn(`[Spotify] Rate-limited — waiting ${Math.ceil(remaining / 1000)}s before next request...`);
    await new Promise((r) => setTimeout(r, remaining));
  }

  // 2. Basic throttle between consecutive calls
  const elapsed = Date.now() - lastCallTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MIN_DELAY_MS - elapsed));
  }
  lastCallTime = Date.now();
}

// --- Internal Fetch Wrapper with retry & token refresh ---

async function getValidToken() {
  if (isTokenExpired()) {
    const newData = await refreshAccessToken();
    return newData.access_token;
  }
  return getAccessToken();
}

async function spotifyFetch(endpoint, options = {}, retries = 1) {
  await waitForRateLimit();

  const token = await getValidToken();
  const url = endpoint.startsWith('http') ? endpoint : `${SPOTIFY_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle 401 — token expired, refresh once
  if (response.status === 401 && retries > 0) {
    await refreshAccessToken();
    return spotifyFetch(endpoint, options, retries - 1);
  }

  // Handle 429 — store global cooldown, then either wait or stop
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
    blockedUntil = Date.now() + retryAfter * 1000;

    if (retryAfter > MAX_WAIT_S || retries <= 0) {
      throw new Error(
        `Limite de requêtes Spotify atteinte. Réessayez dans ${retryAfter} secondes.`
      );
    }
    // Wait the full Retry-After, then retry this one request
    if (isDev) console.warn(`[Spotify] 429 received — pausing ${retryAfter}s (Retry-After)`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return spotifyFetch(endpoint, options, retries - 1);
  }

  // Non-retryable errors — throw immediately
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    if (isDev) console.error(`[Spotify] ${response.status} on ${url}`, errorBody);
    const message = errorBody.error?.message || `Spotify API error: ${response.status}`;
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

// --- Public API Functions ---

// User
export async function getCurrentUser() {
  return spotifyFetch('/me');
}

// Search
export async function searchArtists(query, limit = 10) {
  const params = new URLSearchParams({ q: query, type: 'artist', limit });
  const data = await spotifyFetch(`/search?${params}`);
  return data.artists.items;
}

export async function searchTracks(query, limit = 10) {
  const params = new URLSearchParams({ q: query, type: 'track', limit });
  const data = await spotifyFetch(`/search?${params}`);
  return data.tracks.items;
}

// Artist Albums — paginated (limit 10 per request, max 20 albums to reduce API calls)
export async function getArtistAlbums(artistId, maxAlbums = 20) {
  const allAlbums = [];
  let offset = 0;
  const batchSize = 10;

  while (allAlbums.length < maxAlbums) {
    const params = new URLSearchParams({
      include_groups: 'album,single',
      limit: batchSize,
      offset,
    });
    const data = await spotifyFetch(`/artists/${artistId}/albums?${params}`);
    if (!data.items || data.items.length === 0) break;
    allAlbums.push(...data.items);
    if (!data.next) break;
    offset += batchSize;
  }

  return allAlbums.slice(0, maxAlbums);
}

// Album Tracks
export async function getAlbumTracks(albumId) {
  const params = new URLSearchParams({ limit: 50 });
  const data = await spotifyFetch(`/albums/${albumId}/tracks?${params}`);
  return data.items;
}

// User Top Items
export async function getUserTopTracks(limit = 20, timeRange = 'medium_term') {
  const params = new URLSearchParams({ limit, time_range: timeRange });
  const data = await spotifyFetch(`/me/top/tracks?${params}`);
  return data.items;
}

export async function getUserTopArtists(limit = 20, timeRange = 'medium_term') {
  const params = new URLSearchParams({ limit, time_range: timeRange });
  const data = await spotifyFetch(`/me/top/artists?${params}`);
  return data.items;
}

// --- Mixed track generation (dev mode compatible — Feb 2026+) ---
// Uses albums/tracks endpoints (which still work) instead of the removed
// /recommendations, /artists/{id}/top-tracks, and /artists/{id}/related-artists.
export async function generateMixedTracks({ seedArtistIds = [], seedTrackArtistIds = [], limit = 20 }) {
  const artistIds = [...new Set([...seedArtistIds, ...seedTrackArtistIds])];
  if (artistIds.length === 0) return [];

  const allTracks = [];
  const seenUris = new Set();

  // Fetch tracks from each artist via their albums (max 10 albums per artist to limit API calls)
  for (const id of artistIds.slice(0, 5)) {
    const artistTracks = await getAllArtistTracks(id);
    for (const t of artistTracks) {
      if (!seenUris.has(t.uri)) {
        seenUris.add(t.uri);
        allTracks.push(t);
      }
    }
  }

  // Shuffle and trim to the requested limit
  for (let i = allTracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allTracks[i], allTracks[j]] = [allTracks[j], allTracks[i]];
  }
  return allTracks.slice(0, limit);
}

// Playlist Management — using new /me/playlists endpoint (Feb 2026+)
export async function createPlaylist(name, description = '', isPublic = false) {
  return spotifyFetch('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({
      name,
      description,
      public: isPublic,
    }),
  });
}

export async function addTracksToPlaylist(playlistId, uris) {
  const chunks = [];
  for (let i = 0; i < uris.length; i += 100) {
    chunks.push(uris.slice(i, i + 100));
  }
  for (const chunk of chunks) {
    await spotifyFetch(`/playlists/${playlistId}/items`, {
      method: 'POST',
      body: JSON.stringify({ uris: chunk }),
    });
  }
}

// --- Utility: Gather tracks from an artist's albums ---
export async function getAllArtistTracks(artistId) {
  const albums = await getArtistAlbums(artistId);
  const allTracks = [];
  const seenUris = new Set();

  for (const album of albums) {
    const tracks = await getAlbumTracks(album.id);
    for (const track of tracks) {
      if (!seenUris.has(track.uri)) {
        seenUris.add(track.uri);
        allTracks.push({
          uri: track.uri,
          name: track.name,
          duration_ms: track.duration_ms,
          track_number: track.track_number,
          albumName: album.name,
          albumImage: album.images?.[0]?.url || null,
        });
      }
    }
  }

  return allTracks;
}

// --- Utility: Fisher-Yates Shuffle ---
export function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
