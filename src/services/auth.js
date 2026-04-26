// ============================================
// OAuth 2.0 PKCE Authentication Service
// ============================================
import { CLIENT_ID, REDIRECT_URI, SCOPES, SPOTIFY_AUTH_URL, SPOTIFY_TOKEN_URL } from '../config';

// --- PKCE Helpers ---

function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => possible[v % possible.length]).join('');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeChallenge(codeVerifier) {
  const hashed = await sha256(codeVerifier);
  return base64UrlEncode(hashed);
}

// --- Helpers ---
const isDev = import.meta.env.DEV;

// --- Token Storage (sessionStorage — cleared when tab closes) ---

const TOKEN_KEY = 'spotify_token_data';

export function getStoredTokenData() {
  try {
    const data = sessionStorage.getItem(TOKEN_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    // Auto-clear if Client ID changed (new Spotify app)
    if (parsed.client_id && parsed.client_id !== CLIENT_ID) {
      if (isDev) console.warn('[Auth] Client ID changed — clearing old token');
      clearTokenData();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function storeTokenData(data) {
  const tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
    client_id: CLIENT_ID,
  };
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokenData));
  return tokenData;
}

export function clearTokenData() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('pkce_code_verifier');
}

export function isTokenExpired() {
  const data = getStoredTokenData();
  if (!data) return true;
  // Consider expired if less than 60 seconds remaining
  return Date.now() >= data.expires_at - 60000;
}

export function getAccessToken() {
  const data = getStoredTokenData();
  return data?.access_token || null;
}

// --- Auth Flow ---

export async function redirectToSpotifyAuth() {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  sessionStorage.setItem('pkce_code_verifier', codeVerifier);
  sessionStorage.setItem('oauth_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state,
    show_dialog: 'true',
  });

  if (isDev) console.log('[Auth] Requesting scopes:', SCOPES);
  window.location.href = `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

export function verifyOAuthState(stateFromUrl) {
  const storedState = sessionStorage.getItem('oauth_state');
  sessionStorage.removeItem('oauth_state');
  return !!stateFromUrl && stateFromUrl === storedState;
}

export async function exchangeCodeForToken(code) {
  const codeVerifier = sessionStorage.getItem('pkce_code_verifier');

  if (!codeVerifier) {
    throw new Error('Code verifier not found. Please restart login.');
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || 'Failed to exchange code for token');
  }

  const data = await response.json();
  if (isDev) console.log('[Auth] Token received — scopes granted:', data.scope);
  sessionStorage.removeItem('pkce_code_verifier');
  return storeTokenData(data);
}

export async function refreshAccessToken() {
  const tokenData = getStoredTokenData();

  if (!tokenData?.refresh_token) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: tokenData.refresh_token,
    }),
  });

  if (!response.ok) {
    clearTokenData();
    throw new Error('Failed to refresh token. Please login again.');
  }

  const data = await response.json();
  // If no new refresh_token is provided, keep the old one
  if (!data.refresh_token) {
    data.refresh_token = tokenData.refresh_token;
  }
  return storeTokenData(data);
}
