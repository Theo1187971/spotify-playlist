// ============================================
// Spotify App Configuration
// ============================================
// 1. Go to https://developer.spotify.com/dashboard
// 2. Create a new app
// 3. Copy the Client ID below
// 4. Add http://localhost:5173/callback as a Redirect URI
// ============================================

export const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;

export const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;

export const SCOPES = [
  'user-read-private',
  'user-top-read',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

export const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
