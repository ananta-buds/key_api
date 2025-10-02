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
              {loading ? '🔄' : '🔄'} Refresh Sessions
            </button>

            <button
              onClick={clearAllSessions}
              className="danger-btn"
              disabled={loading}
            >
              🗑️ Clear All Sessions
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
                  <h4>No Active Sessions</h4>
                  <p>No admin sessions are currently active</p>
                </div>
              ) : (
                <div className="sessions-table">
                  <div className="table-header">
                    <div className="header-cell">Username</div>
                    <div className="header-cell">Session ID</div>
                    <div className="header-cell">IP Address</div>
                    <div className="header-cell">Created</div>
                    <div className="header-cell">User Agent</div>
                  </div>
                  {sessions.map((session) => (
                    <div key={session.id} className="table-row">
                      <div className="table-cell username">
                        <strong>{session.username || 'unknown'}</strong>
                      </div>
                      <div className="table-cell session-id">
                        <code>{session.id.substring(0, 12)}...</code>
                      </div>
                      <div className="table-cell ip-address">
                        {session.ip}
                      </div>
                      <div className="table-cell created-date">
                        {formatDate(session.createdAt)}
                      </div>
                      <div className="table-cell user-agent">
                        <span title={session.userAgent}>
                          {session.userAgent?.substring(0, 50)}...
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
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
