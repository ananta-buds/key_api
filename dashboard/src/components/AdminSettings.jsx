import { useState, useEffect } from 'react';
import './AdminSettings.css';
import AdminUsersManager from './AdminUsersManager';

function AdminSettings() {
  const [activeTab, setActiveTab] = useState('sessions');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeTab === 'sessions') {
      fetchSessions();
    }
  }, [activeTab]);

  const fetchSessions = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/admin/api/sessions', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      } else {
        throw new Error('Failed to fetch sessions');
      }
    } catch (error) {
      setError('Error fetching sessions: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const clearAllSessions = async () => {
    if (!window.confirm('Are you sure you want to clear all admin sessions? This will log out all users.')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/admin/api/sessions', {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        // Redirect to login since our session will be cleared too
        window.location.href = '/admin/login';
      } else {
        throw new Error('Failed to clear sessions');
      }
    } catch (error) {
      setError('Error clearing sessions: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getTimeAgo = (dateString) => {
    if (!dateString) return 'N/A';
    const diff = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}m atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    const days = Math.floor(hours / 24);
    return `${days}d atrás`;
  };

  const parseUserAgent = (ua) => {
    if (!ua) return 'Desconhecido';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Edg')) return 'Edge';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    return ua.substring(0, 30);
  };

  return (
    <div className="admin-settings">
      <div className="settings-header">
        <h2>Admin Settings</h2>
        <p>Manage admin sessions and system configuration</p>
      </div>

      {/* Tabs Navigation */}
      <div className="settings-tabs">
        <button
          className={`tab-button ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          🔐 Sessions
        </button>
        <button
          className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 Admin Users
        </button>
        <button
          className={`tab-button ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          💻 System
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'users' ? (
        <AdminUsersManager />
      ) : (
        <div className="settings-sections">
        {/* Session Management */}
        {activeTab === 'sessions' && (
        <div className="settings-section">
          <div className="section-header">
            <h3>👥 Active Sessions</h3>
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          <div className="sessions-controls">
            <button
              onClick={fetchSessions}
              className="refresh-btn"
              disabled={loading}
            >
              Atualizar
            </button>

            <button
              onClick={clearAllSessions}
              className="danger-btn"
              disabled={loading}
            >
              Encerrar todas
            </button>
          </div>

          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading sessions...</p>
            </div>
          ) : (
            <div className="sessions-list">
              {sessions.length === 0 ? (
                <div className="empty-sessions">
                  <div className="empty-icon">👤</div>
                  <h4>Nenhuma sessão ativa</h4>
                  <p>Não há sessões admin ativas no momento</p>
                </div>
              ) : (
                <>
                  <div className="sessions-count">{sessions.length} sessão(ões) ativa(s)</div>
                  <div className="sessions-table-wrap">
                    <table className="sessions-table">
                      <thead>
                        <tr>
                          <th>Usuário</th>
                          <th>IP</th>
                          <th>Navegador</th>
                          <th>Criada</th>
                          <th>Último acesso</th>
                          <th>Expira</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map((session) => (
                          <tr key={session.id} className={session.isCurrent ? 'current-row' : ''}>
                            <td className="session-username-cell">
                              {session.username || 'unknown'}
                              {session.isCurrent && <span className="current-badge">você</span>}
                            </td>
                            <td className="session-ip-cell">{session.ip || 'N/A'}</td>
                            <td>{parseUserAgent(session.userAgent)}</td>
                            <td>{formatDate(session.createdAt)}</td>
                            <td>{getTimeAgo(session.lastSeenAt)}</td>
                            <td>{formatDate(session.expiresAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        )}

        {/* System Information */}
        {activeTab === 'system' && (
        <div className="settings-section">
          <div className="section-header">
            <h3>💻 System Information</h3>
          </div>

          <div className="setting-card">
            <div className="setting-info">
              <h4>API Version</h4>
              <p>Current version of Konan Free API</p>
              <code className="version-display">v2.0.0</code>
            </div>
          </div>

          <div className="setting-card">
            <div className="setting-info">
              <h4>Documentation</h4>
              <p>Links to documentation and resources</p>
              <div className="links">
                <a href="/health" target="_blank" rel="noopener noreferrer" className="doc-link">
                  🏥 API Health Check
                </a>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      )}
    </div>
  );
}

export default AdminSettings;
