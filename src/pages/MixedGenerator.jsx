import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  searchArtists,
  searchTracks,
  getUserTopArtists,
  generateMixedTracks,
  createPlaylist,
  addTracksToPlaylist,
} from '../services/spotify';
import './MixedGenerator.css';

export default function MixedGenerator() {
  const { user } = useAuth();

  // State
  const [mode, setMode] = useState('tracks'); // 'tracks' or 'artists'
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [playlistName, setPlaylistName] = useState('');
  const [trackCount, setTrackCount] = useState(20);
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const searchTimeout = useRef(null);
  const dropdownRef = useRef(null);

  const MAX_USER_SEEDS = 3;
  const MAX_SEEDS = 5;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Clear selections when mode changes
  useEffect(() => {
    setSelectedItems([]);
    setQuery('');
    setSearchResults([]);
    setShowDropdown(false);
    setError(null);
  }, [mode]);

  // Debounced search
  const handleSearch = useCallback((value) => {
    setQuery(value);
    setError(null);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = mode === 'tracks'
          ? await searchTracks(value)
          : await searchArtists(value);
        setSearchResults(results);
        setShowDropdown(true);
      } catch (err) {
        setError(`Erreur de recherche : ${err.message}`);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [mode]);

  // Select item from dropdown
  const handleSelectItem = useCallback((item) => {
    if (selectedItems.length >= MAX_USER_SEEDS) return;
    if (selectedItems.some((s) => s.id === item.id)) return;
    setSelectedItems((prev) => [...prev, item]);
    setQuery('');
    setSearchResults([]);
    setShowDropdown(false);
  }, [selectedItems]);

  // Remove item
  const handleRemoveItem = useCallback((itemId) => {
    setSelectedItems((prev) => prev.filter((s) => s.id !== itemId));
  }, []);

  // Generate playlist
  const handleGenerate = async () => {
    if (selectedItems.length === 0) {
      setError('Sélectionnez au moins un élément.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      // 1. Collect artist IDs from seeds
      let seedArtistIds = [];
      let seedTrackArtistIds = [];

      if (mode === 'tracks') {
        // Extract artist IDs from selected tracks
        seedTrackArtistIds = selectedItems
          .flatMap((t) => t.artists?.map((a) => a.id) || [])
          .filter((id, i, arr) => arr.indexOf(id) === i);
      } else {
        seedArtistIds = selectedItems.map((a) => a.id);
      }

      // Complement with user's top artists if we have few seeds
      const totalSeeds = seedArtistIds.length + seedTrackArtistIds.length;
      if (totalSeeds < 3) {
        const topArtists = await getUserTopArtists(3 - totalSeeds);
        const existingIds = new Set([...seedArtistIds, ...seedTrackArtistIds]);
        const topIds = topArtists
          .map((a) => a.id)
          .filter((id) => !existingIds.has(id));
        seedArtistIds.push(...topIds.slice(0, 3 - totalSeeds));
      }

      // 2. Generate tracks using top tracks + related artists
      const recommendedTracks = await generateMixedTracks({
        seedArtistIds,
        seedTrackArtistIds,
        limit: Math.min(trackCount, 100),
      });

      if (!recommendedTracks || recommendedTracks.length === 0) {
        setError('Aucune recommandation trouvée. Essayez avec d\'autres seeds.');
        setIsGenerating(false);
        return;
      }

      // 3. Create playlist
      const name = playlistName.trim() || `Mix Recommandé — ${selectedItems.map((s) => s.name).join(', ')}`;
      const description = `Playlist générée via recommandations Spotify avec ${recommendedTracks.length} morceaux.`;

      const playlist = await createPlaylist(name, description);
      const uris = recommendedTracks.map((t) => t.uri);
      await addTracksToPlaylist(playlist.id, uris);

      setResult({
        name: playlist.name,
        trackCount: uris.length,
        url: playlist.external_urls.spotify,
      });
    } catch (err) {
      setError(`Erreur : ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Helpers for rendering
  const getItemImage = (item) => {
    if (mode === 'tracks') return item.album?.images?.[0]?.url || '';
    return item.images?.[0]?.url || '';
  };

  const getItemMeta = (item) => {
    if (mode === 'tracks') return item.artists?.map((a) => a.name).join(', ') || '';
    return `${item.followers?.total?.toLocaleString() || 0} abonnés`;
  };

  return (
    <div className="mixed-generator animate-fade-in" id="page-mixed">
      <div className="page-header">
        <h1 className="page-title">🎯 Générateur Mixte</h1>
        <p className="page-subtitle">
          Créez une playlist en mélangeant vos choix avec vos préférences d'écoute via les recommandations Spotify.
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {result ? (
        <div className="playlist-result" id="playlist-result-mixed">
          <div className="playlist-result-icon">🎉</div>
          <h2 className="playlist-result-title">Playlist créée !</h2>
          <p className="playlist-result-desc">
            <strong>{result.name}</strong> — {result.trackCount} morceaux ajoutés
          </p>
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary" id="btn-open-playlist-mixed">
            Ouvrir dans Spotify
          </a>
          <button
            className="btn btn-secondary"
            style={{ marginLeft: '12px', marginTop: '12px' }}
            onClick={() => {
              setResult(null);
              setSelectedItems([]);
              setPlaylistName('');
            }}
            id="btn-new-playlist-mixed"
          >
            Nouvelle playlist
          </button>
        </div>
      ) : (
        <div className="glass-card">
          {/* Mode Toggle */}
          <div className="section">
            <div className="section-title">Mode de recherche</div>
            <div className="toggle-tabs" id="mode-toggle">
              <button
                className={`toggle-tab ${mode === 'tracks' ? 'active' : ''}`}
                onClick={() => setMode('tracks')}
                id="tab-tracks"
              >
                🎵 Morceaux
              </button>
              <button
                className={`toggle-tab ${mode === 'artists' ? 'active' : ''}`}
                onClick={() => setMode('artists')}
                id="tab-artists"
              >
                🎤 Artistes
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="section">
            <div className="section-title">
              Sélectionner des {mode === 'tracks' ? 'morceaux' : 'artistes'} ({selectedItems.length}/{MAX_USER_SEEDS})
            </div>
            <div className="search-container" ref={dropdownRef}>
              <input
                type="text"
                className="form-input"
                placeholder={mode === 'tracks' ? 'Rechercher un morceau...' : 'Rechercher un artiste...'}
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                disabled={isGenerating || selectedItems.length >= MAX_USER_SEEDS}
                id="input-mixed-search"
              />
              {isSearching && (
                <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                  <div className="spinner spinner-sm" />
                </div>
              )}
              {showDropdown && searchResults.length > 0 && (
                <div className="search-dropdown" id="mixed-dropdown">
                  {searchResults.map((item) => (
                    <div
                      key={item.id}
                      className="search-result-item"
                      onClick={() => handleSelectItem(item)}
                    >
                      <img
                        src={getItemImage(item)}
                        alt={item.name}
                        className={`search-result-img ${mode === 'artists' ? 'round' : ''}`}
                      />
                      <div className="search-result-info">
                        <div className="search-result-name">{item.name}</div>
                        <div className="search-result-meta">{getItemMeta(item)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected Items */}
          {selectedItems.length > 0 && (
            <div className="section">
              <div className="section-title">Sélection</div>
              <div className="chips-list" id="selected-items-mixed">
                {selectedItems.map((item) => (
                  <div key={item.id} className="chip">
                    {getItemImage(item) && (
                      <img src={getItemImage(item)} alt="" className="chip-img" />
                    )}
                    <span>{item.name}</span>
                    <button
                      className="chip-remove"
                      onClick={() => handleRemoveItem(item.id)}
                      disabled={isGenerating}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mixed-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span>
              Les seeds restants (jusqu'à 5 au total) seront complétés automatiquement avec vos {mode === 'tracks' ? 'morceaux' : 'artistes'} les plus écoutés.
            </span>
          </div>

          {/* Config */}
          <div className="section mixed-config">
            <div className="form-group">
              <label className="form-label" htmlFor="input-mixed-count">Nombre de morceaux</label>
              <input
                type="number"
                className="form-input"
                id="input-mixed-count"
                min={1}
                max={100}
                value={trackCount}
                onChange={(e) => setTrackCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                disabled={isGenerating}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="input-mixed-playlist-name">Nom de la playlist (optionnel)</label>
              <input
                type="text"
                className="form-input"
                id="input-mixed-playlist-name"
                placeholder="Mix Recommandé"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                disabled={isGenerating}
              />
            </div>
          </div>

          {/* Generate Button */}
          <button
            className="btn btn-primary btn-generate-mixed"
            onClick={handleGenerate}
            disabled={isGenerating || selectedItems.length === 0}
            id="btn-generate-mixed"
          >
            {isGenerating ? (
              <>
                <div className="spinner spinner-sm" style={{ borderTopColor: '#000' }} />
                Génération en cours...
              </>
            ) : (
              <>
                🎯 Générer la playlist mixte
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
