import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  searchArtists,
  searchTracks,
  getAllArtistTracks,
  shuffleArray,
  createPlaylist,
  addTracksToPlaylist,
} from '../services/spotify';
import './RandomGenerator.css';

export default function RandomGenerator() {
  const { user } = useAuth();

  // State
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedArtists, setSelectedArtists] = useState([]);
  const [tracksPerArtist, setTracksPerArtist] = useState(5);
  const [playlistName, setPlaylistName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectionMode, setSelectionMode] = useState('random'); // 'random' or 'popular'

  const searchTimeout = useRef(null);
  const dropdownRef = useRef(null);

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
        const results = await searchArtists(value);
        setSearchResults(results);
        setShowDropdown(true);
      } catch (err) {
        setError(`Erreur de recherche : ${err.message}`);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // Select artist from dropdown
  const handleSelectArtist = useCallback((artist) => {
    if (selectedArtists.some((a) => a.id === artist.id)) return;
    setSelectedArtists((prev) => [...prev, artist]);
    setQuery('');
    setSearchResults([]);
    setShowDropdown(false);
  }, [selectedArtists]);

  // Remove artist from selected
  const handleRemoveArtist = useCallback((artistId) => {
    setSelectedArtists((prev) => prev.filter((a) => a.id !== artistId));
  }, []);

  // Generate playlist
  const handleGenerate = async () => {
    if (selectedArtists.length === 0) {
      setError('Ajoutez au moins un artiste.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);

    const total = selectedArtists.length;
    const allSelectedTracks = [];

    try {
      // Step 1: Gather tracks for each artist
      for (let i = 0; i < selectedArtists.length; i++) {
        const artist = selectedArtists[i];
        setProgress({
          current: i + 1,
          total: total + 1,
          message: `Récupération des morceaux de ${artist.name}...`,
        });

        let picked = [];

        if (selectionMode === 'popular') {
          // Use search to get most popular tracks (Spotify search sorts by relevance/popularity)
          const searchResults = await searchTracks(
            `artist:${artist.name}`,
            Math.min(tracksPerArtist, 50)
          );
          // Filter to make sure the tracks are actually from the correct artist
          picked = searchResults
            .filter((t) => t.artists.some((a) => a.id === artist.id))
            .slice(0, tracksPerArtist)
            .map((t) => ({
              uri: t.uri,
              name: t.name,
              duration_ms: t.duration_ms,
              albumName: t.album?.name || '',
              albumImage: t.album?.images?.[0]?.url || null,
            }));
        } else {
          // Random mode: fetch all tracks from albums and pick randomly
          const tracks = await getAllArtistTracks(artist.id);
          if (tracks.length === 0) continue;
          const shuffled = shuffleArray(tracks);
          picked = shuffled.slice(0, Math.min(tracksPerArtist, shuffled.length));
        }

        allSelectedTracks.push(...picked);
      }

      if (allSelectedTracks.length === 0) {
        setError('Aucun morceau trouvé pour les artistes sélectionnés.');
        setIsGenerating(false);
        return;
      }

      // Step 2: Create playlist
      setProgress({
        current: total + 1,
        total: total + 1,
        message: 'Création de la playlist...',
      });

      const modeLabel = selectionMode === 'popular' ? 'Top' : 'Mix Aléatoire';
      const name = playlistName.trim() || `${modeLabel} — ${selectedArtists.map((a) => a.name).join(', ')}`;
      const modeDesc = selectionMode === 'popular' ? 'les plus populaires' : 'aléatoirement';
      const description = `Playlist générée (${modeDesc}) avec ${allSelectedTracks.length} morceaux de ${selectedArtists.map((a) => a.name).join(', ')}.`;

      const playlist = await createPlaylist(name, description);
      const uris = allSelectedTracks.map((t) => t.uri);
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
      setProgress({ current: 0, total: 0, message: '' });
    }
  };

  return (
    <div className="random-generator animate-fade-in" id="page-random">
      <div className="page-header">
        <h1 className="page-title">🎲 Générateur Aléatoire</h1>
        <p className="page-subtitle">
          Créez une playlist avec des morceaux aléatoires piochés dans les albums de vos artistes.
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {result ? (
        <div className="playlist-result" id="playlist-result">
          <div className="playlist-result-icon">🎉</div>
          <h2 className="playlist-result-title">Playlist créée !</h2>
          <p className="playlist-result-desc">
            <strong>{result.name}</strong> — {result.trackCount} morceaux ajoutés
          </p>
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary" id="btn-open-playlist">
            Ouvrir dans Spotify
          </a>
          <button
            className="btn btn-secondary"
            style={{ marginLeft: '12px', marginTop: '12px' }}
            onClick={() => {
              setResult(null);
              setSelectedArtists([]);
              setPlaylistName('');
            }}
            id="btn-new-playlist"
          >
            Nouvelle playlist
          </button>
        </div>
      ) : (
        <div className="glass-card">
          {/* Search */}
          <div className="section">
            <div className="section-title">Ajouter des Artistes</div>
            <div className="search-container" ref={dropdownRef}>
              <input
                type="text"
                className="form-input"
                placeholder="Rechercher un artiste..."
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                disabled={isGenerating}
                id="input-artist-search"
              />
              {isSearching && (
                <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                  <div className="spinner spinner-sm" />
                </div>
              )}
              {showDropdown && searchResults.length > 0 && (
                <div className="search-dropdown" id="artist-dropdown">
                  {searchResults.map((artist) => (
                    <div
                      key={artist.id}
                      className="search-result-item"
                      onClick={() => handleSelectArtist(artist)}
                    >
                      <img
                        src={artist.images?.[0]?.url || ''}
                        alt={artist.name}
                        className="search-result-img round"
                      />
                      <div className="search-result-info">
                        <div className="search-result-name">{artist.name}</div>
                        <div className="search-result-meta">
                          {artist.followers?.total?.toLocaleString()} abonnés
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected Artists */}
          {selectedArtists.length > 0 && (
            <div className="section">
              <div className="section-title">Artistes sélectionnés ({selectedArtists.length})</div>
              <div className="chips-list" id="selected-artists">
                {selectedArtists.map((artist) => (
                  <div key={artist.id} className="chip">
                    {artist.images?.[0] && (
                      <img src={artist.images[0].url} alt="" className="chip-img" />
                    )}
                    <span>{artist.name}</span>
                    <button
                      className="chip-remove"
                      onClick={() => handleRemoveArtist(artist.id)}
                      disabled={isGenerating}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selection Mode */}
          <div className="section">
            <div className="section-title">Mode de sélection</div>
            <div className="toggle-tabs" id="selection-mode-toggle">
              <button
                className={`toggle-tab ${selectionMode === 'random' ? 'active' : ''}`}
                onClick={() => setSelectionMode('random')}
                disabled={isGenerating}
                id="tab-random"
              >
                🎲 Aléatoire
              </button>
              <button
                className={`toggle-tab ${selectionMode === 'popular' ? 'active' : ''}`}
                onClick={() => setSelectionMode('popular')}
                disabled={isGenerating}
                id="tab-popular"
              >
                🔥 Plus populaires
              </button>
            </div>
          </div>

          {/* Config */}
          <div className="section random-config">
            <div className="form-group">
              <label className="form-label" htmlFor="input-tracks-count">Morceaux par artiste</label>
              <input
                type="number"
                className="form-input"
                id="input-tracks-count"
                min={1}
                max={50}
                value={tracksPerArtist}
                onChange={(e) => setTracksPerArtist(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                disabled={isGenerating}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="input-playlist-name">Nom de la playlist (optionnel)</label>
              <input
                type="text"
                className="form-input"
                id="input-playlist-name"
                placeholder="Mix Aléatoire"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                disabled={isGenerating}
              />
            </div>
          </div>

          {/* Progress */}
          {isGenerating && progress.total > 0 && (
            <div className="progress-container">
              <div className="progress-text">
                <span>{progress.message}</span>
                <span>{Math.round((progress.current / progress.total) * 100)}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Generate Button */}
          <button
            className="btn btn-primary btn-generate"
            onClick={handleGenerate}
            disabled={isGenerating || selectedArtists.length === 0}
            id="btn-generate-random"
          >
            {isGenerating ? (
              <>
                <div className="spinner spinner-sm" style={{ borderTopColor: '#000' }} />
                Génération en cours...
              </>
            ) : (
              <>
                {selectionMode === 'popular' ? '🔥' : '🎲'} Générer la playlist
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
