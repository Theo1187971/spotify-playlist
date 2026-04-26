import React, { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { verifyOAuthState } from './services/auth';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import RandomGenerator from './pages/RandomGenerator';
import MixedGenerator from './pages/MixedGenerator';

function CallbackHandler() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleCallback } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    // Guard: StrictMode fires effects twice — auth codes are single-use
    if (processed.current) return;

    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    if (error) {
      navigate('/', { replace: true });
      return;
    }

    // Verify OAuth state to prevent CSRF attacks
    if (code && !verifyOAuthState(state)) {
      console.error('OAuth state mismatch — possible CSRF attack');
      navigate('/', { replace: true });
      return;
    }

    if (code) {
      processed.current = true;
      // Clean authorization code from URL immediately
      window.history.replaceState({}, '', '/callback');
      handleCallback(code).then(() => {
        navigate('/random', { replace: true });
      });
    }
  }, [searchParams, handleCallback, navigate]);

  return (
    <div className="callback-loading">
      <div className="spinner" />
      <p>Connexion en cours...</p>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="callback-loading">
        <div className="spinner" />
        <p>Chargement...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  return (
    <div className="app">
      {isAuthenticated && <Navbar />}
      <main className="main-content">
        <Routes>
          <Route
            path="/"
            element={
              loading ? (
                <div className="callback-loading">
                  <div className="spinner" />
                </div>
              ) : isAuthenticated ? (
                <Navigate to="/random" replace />
              ) : (
                <Login />
              )
            }
          />
          <Route path="/callback" element={<CallbackHandler />} />
          <Route
            path="/random"
            element={
              <ProtectedRoute>
                <RandomGenerator />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mixed"
            element={
              <ProtectedRoute>
                <MixedGenerator />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
