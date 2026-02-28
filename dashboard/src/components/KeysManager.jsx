import { useState, useEffect } from 'react';
import './KeysManager.css';
import KeyDetailModal from './KeyDetailModal';

function KeysManager() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchType, setSearchType] = useState('key');
  const [searchValue, setSearchValue] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);

  // API base URL (same-origin by default)
  const API_BASE = window.API_BASE || '';

  const handleSearch = async (e) => {
    e.preventDefault();

    if (!searchValue.trim()) {
      setError('Please enter a search value');
      return;
    }

    setLoading(true);
    setError('');
    setKeys([]);
    setHasSearched(true);

    let url = '';
    if (searchType === 'key') {
      url = `${API_BASE}/api/keys/info/${searchValue}`;
    } else {
      url = `${API_BASE}/api/keys/user/${searchValue}`;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Not found or API error');
      const data = await res.json();

      // Normalize keys to snake_case for table
      const normalize = (item) => ({
        keyId: item.key_id,
        userId: item.user_id,
        expiry: item.expires_at,
        active: item.active !== false,
        status: item.status || 'active',
        created: item.created_at,
        usage: item.usage_count || 0,
        lastAccessed: item.last_accessed,
        ipAddress: item.ip_address || null
      });

      if (searchType === 'key') {
        // API returns { data: {...} }
        setKeys(data && data.data ? [normalize(data.data)] : []);
      } else {
        // API returns { msg, code, user_id, keys: [...] }
        // For user search, use the user_id from the response root
        const userIdFromResponse = data.user_id;
        setKeys(data && data.keys ? data.keys.map(item => ({
          ...normalize(item),
          userId: userIdFromResponse
        })) : []);
      }
    } catch (err) {
      setError('Error searching: ' + err.message);
      setKeys([]);
    }
    setLoading(false);
  };

  const handleDelete = async (keyId) => {
    if (!window.confirm('Are you sure you want to delete this key?')) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/keys/${keyId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Error deleting');

      setKeys(keys.filter(k => k.keyId !== keyId));
    } catch (err) {
      setError('Error deleting: ' + err.message);
    }
    setLoading(false);
  };

  // Desativado por enquanto: endpoint /api/keys/:keyId/active não existe no backend
  const handleToggleActive = async (_keyId) => {
    setError('Toggle active is not available yet');
  };

  // Desativado por enquanto: endpoint /api/keys/:keyId/expiry não existe no backend
  const handleEditExpiry = async (_keyId) => {
    setError('Edit expiry is not available yet');
  };

  const handleUpdateKey = async (keyId, updates) => {
    const res = await fetch(`${API_BASE}/api/keys/${keyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Erro ao atualizar chave');
    }
    const data = await res.json();

    // Update local state with returned data
    setKeys(prev => prev.map(k => {
      if (k.keyId !== keyId) return k;
      const d = data.data;
      return {
        ...k,
        expiry: d.expires_at,
        active: d.status === 'active',
        status: d.status,
        usage: d.usage_count ?? k.usage,
        lastAccessed: d.last_accessed ?? k.lastAccessed,
        ipAddress: d.ip_address ?? k.ipAddress
      };
    }));
  };

  const handleOpenDetail = (key) => {
    setSelectedKey(key);
  };

  const handleUserIdClick = (userId) => {
    console.log(`User ID clicked: ${userId}`);
  };

  // Copiar keyId ao clicar
  const [copiedKeyId, setCopiedKeyId] = useState(null);
  const handleKeyIdClick = async (keyId) => {
    try {
      await navigator.clipboard.writeText(keyId);
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 1000);
    } catch (err) {
      // Silencioso, sem mensagem
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleString();
  };

  const isExpired = (expiryDate) => {
    return new Date(expiryDate) < new Date();
  };

  return (
    <div className="keys-manager">
      <div className="manager-header">
        <h2>API Keys Manager</h2>
      </div>

      <div className="search-section">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-controls">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              className="search-type"
            >
              <option value="key">Search by Key ID</option>
              <option value="user">Search by User ID</option>
            </select>

            <input
              type="text"
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value);
                // Só limpa erro e hasSearched se o campo ficar completamente vazio
                if (e.target.value === '') {
                  setHasSearched(false);
                  setError('');
                }
              }}
              placeholder={searchType === 'key' ? 'Enter key ID...' : 'Enter user ID...'}
              className="search-input"
            />

            <button
              type="submit"
              className="search-button"
              disabled={loading}
            >
              {loading ? <span className="loading-icon">⏳</span> : '🔍'} Search
            </button>
          </div>
        </form>
      </div>

      <div className="results-section">
        {loading && (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Searching...</p>
          </div>
        )}

        {!loading && keys.length === 0 && searchValue && hasSearched && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No keys found</h3>
            <p>Try searching with a different {searchType === 'key' ? 'key ID' : 'user ID'}</p>
          </div>
        )}

        {!loading && keys.length === 0 && (!hasSearched || !searchValue) && (
          <div className="empty-state">
            {error ? (
              <>
                <div className="empty-icon">⚠️</div>
                <h3>Search Error</h3>
                <p>{error}</p>
              </>
            ) : (
              <>
                <div className="empty-icon">🔑</div>
                <h3>Ready to search</h3>
                <p>Enter a key ID or user ID above to get started</p>
              </>
            )}
          </div>
        )}

        {keys.length > 0 && (
          <div className="keys-table-container">
            <table className="keys-table">
              <thead>
                <tr>
                  <th>Key ID</th>
                  <th>User ID</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Usage</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr
                    key={key.keyId}
                    className={`clickable-row ${isExpired(key.expiry) ? 'expired' : ''}`}
                    onClick={() => handleOpenDetail(key)}
                  >
                    <td className="key-id" style={{ position: 'relative' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleKeyIdClick(key.keyId); }}
                        style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', outline: 'none' }}
                        title="Copiar Key ID"
                        className="copy-keyid-btn"
                        tabIndex={0}
                        onMouseDown={e => e.preventDefault()}
                      >
                        <code>{key.keyId}</code>
                      </button>
                      {copiedKeyId === key.keyId && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '-22px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: '#222',
                            color: '#57f287',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            pointerEvents: 'none',
                            zIndex: 10
                          }}
                        >
                          Copied!
                        </span>
                      )}
                    </td>
                    <td className="user-id">
                      <span className="user-id-badge">{key.userId}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${key.active && !isExpired(key.expiry) ? 'active' : 'inactive'}`}>
                        {key.active && !isExpired(key.expiry) ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(key.created)}</td>
                    <td className={isExpired(key.expiry) ? 'expired-date' : ''}>
                      {formatDate(key.expiry)}
                    </td>
                    <td>{key.usage || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de detalhes/edição */}
      {selectedKey && (
        <KeyDetailModal
          keyData={selectedKey}
          onClose={() => setSelectedKey(null)}
          onSave={handleUpdateKey}
          onDelete={async (keyId) => {
            await handleDelete(keyId);
            setSelectedKey(null);
          }}
        />
      )}
    </div>
  );
}

export default KeysManager;
