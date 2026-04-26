import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { exchangeCodeForToken, getStoredTokenData, clearTokenData, isTokenExpired, refreshAccessToken, redirectToSpotifyAuth } from '../services/auth';
import { getCurrentUser } from '../services/spotify';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isAuthenticated = !!token && !!user;

  // Fetch user profile
  const fetchUser = useCallback(async () => {
    try {
      const profile = await getCurrentUser();
      setUser(profile);
    } catch (err) {
      console.error('Failed to fetch user:', err);
      setError('Impossible de récupérer le profil utilisateur.');
      clearTokenData();
      setToken(null);
      setUser(null);
    }
  }, []);

  // Initialize auth state from localStorage
  useEffect(() => {
    const init = async () => {
      const stored = getStoredTokenData();
      if (stored?.access_token) {
        if (isTokenExpired()) {
          try {
            const newData = await refreshAccessToken();
            setToken(newData.access_token);
          } catch {
            clearTokenData();
            setLoading(false);
            return;
          }
        } else {
          setToken(stored.access_token);
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  // Fetch user when token is available
  useEffect(() => {
    if (token) {
      fetchUser();
    }
  }, [token, fetchUser]);

  // Set up token refresh timer
  useEffect(() => {
    if (!token) return;

    const stored = getStoredTokenData();
    if (!stored) return;

    const msUntilExpiry = stored.expires_at - Date.now() - 120000; // refresh 2 min before expiry
    if (msUntilExpiry <= 0) return;

    const timer = setTimeout(async () => {
      try {
        const newData = await refreshAccessToken();
        setToken(newData.access_token);
      } catch {
        clearTokenData();
        setToken(null);
        setUser(null);
      }
    }, msUntilExpiry);

    return () => clearTimeout(timer);
  }, [token]);

  // Handle OAuth callback
  const handleCallback = useCallback(async (code) => {
    try {
      setLoading(true);
      setError(null);
      const tokenData = await exchangeCodeForToken(code);
      setToken(tokenData.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(() => {
    redirectToSpotifyAuth();
  }, []);

  const logout = useCallback(() => {
    clearTokenData();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, loading, error, login, logout, handleCallback }}>
      {children}
    </AuthContext.Provider>
  );
}
