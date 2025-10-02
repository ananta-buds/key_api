import { useState, useEffect } from 'react';
import './AdminUsersManager.css';

function AdminUsersManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [stats, setStats] = useState({ total: 0, active: 0, expired: 0 });

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    hours: '',
    permanent: false
  });

  const normalizeAdmin = (admin) => {
    const expiresAt = admin.expires_at ? new Date(admin.expires_at) : null;
    const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : false;

    return {
      id: admin.id,
      username: admin.username,
      status: admin.status || 'UNKNOWN',
      is_permanent: Boolean(admin.is_permanent),
      expires_at: admin.expires_at,
      is_expired: isExpired,
      created_at: admin.created_at,
      updated_at: admin.updated_at,
      last_login_at: admin.last_login_at,
      notes: admin.notes || null
    };
  };

  const calculateStats = (admins) => {
    const total = admins.length;
    const active = admins.filter((admin) => admin.status === 'ACTIVE' && !admin.is_expired).length;
    const expired = admins.filter((admin) => admin.is_expired).length;
    return { total, active, expired };
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/admin/api/admins', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        const admins = (data.admins || []).map(normalizeAdmin);
        setUsers(admins);
        setStats(calculateStats(admins));
      } else {
        const message = await response.text();
        throw new Error(message || 'Failed to fetch admin users');
      }
    } catch (error) {
      setError('Error fetching admin users: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        username: formData.username.trim(),
        password: formData.password,
        status: 'ACTIVE',
        is_permanent: formData.permanent
      };

      if (!formData.permanent) {
        const hours = parseInt(formData.hours, 10);
        if (Number.isFinite(hours) && hours > 0) {
          payload.expires_at = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        }
      }

      const response = await fetch('/admin/api/admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('Admin user created successfully!');
        setFormData({ username: '', password: '', hours: '', permanent: false });
        setShowCreateForm(false);
        await fetchUsers();
      } else {
        throw new Error(data.message || 'Failed to create admin user');
      }
    } catch (error) {
      setError('Error creating admin user: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id, username) => {
    if (!window.confirm(`Are you sure you want to delete admin user "${username}"?`)) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/admin/api/admins/${id}?hard=true`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('Admin user deleted successfully!');
        await fetchUsers();
      } else {
        throw new Error(data.message || 'Failed to delete admin user');
      }
    } catch (error) {
      setError('Error deleting admin user: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/admin/api/admins/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        await fetchUsers();
      } else {
        throw new Error(data.message || 'Failed to update status');
      }
    } catch (error) {
      setError('Error updating status: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (user) => {
    if (user.status !== 'ACTIVE') {
      return <span className="badge badge-disabled">Disabled</span>;
    }
    if (user.is_expired) {
      return <span className="badge badge-expired">Expired</span>;
    }
    return <span className="badge badge-active">Active</span>;
  };

  const getExpiryInfo = (user) => {
    if (user.is_permanent) {
      return <span className="expiry-permanent">🔓 Permanent</span>;
    }
    if (user.is_expired) {
      return <span className="expiry-expired">⏰ Expired: {formatDate(user.expires_at)}</span>;
    }
    return <span className="expiry-valid">⏰ Expires: {formatDate(user.expires_at)}</span>;
  };

  return (
    <div className="admin-users-manager">
      <div className="manager-header">
        <div>
          <h2>👥 Admin Users Management</h2>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="btn-create"
          disabled={loading}
        >
          {showCreateForm ? '✕ Cancel' : '➕ Create Admin'}
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-info">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Admins</div>
          </div>
        </div>
        <div className="stat-card stat-active">
          <div className="stat-icon">✅</div>
          <div className="stat-info">
            <div className="stat-value">{stats.active}</div>
            <div className="stat-label">Active</div>
          </div>
        </div>
        <div className="stat-card stat-expired">
          <div className="stat-icon">⏰</div>
          <div className="stat-info">
            <div className="stat-value">{stats.expired}</div>
            <div className="stat-label">Expired</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="create-form-container">
          <form onSubmit={handleCreateUser} className="create-form">
            <h3>Create New Admin User</h3>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="username">Username *</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="Letters, numbers, _ or - (3-30 chars)"
                  pattern="[a-zA-Z0-9_-]{3,30}"
                  minLength="3"
                  maxLength="30"
                  required
                  disabled={loading}
                />
                <small>Only letters, numbers, underscore, or hyphen</small>
              </div>

              <div className="form-group">
                <label htmlFor="password">Password *</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Min. 8 chars (uppercase, lowercase, number)"
                  minLength="8"
                  required
                  disabled={loading}
                />
                <small>Must contain uppercase, lowercase, and number</small>
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="permanent"
                  checked={formData.permanent}
                  onChange={handleInputChange}
                  disabled={loading}
                />
                <span>Permanent Access (no expiration)</span>
              </label>
            </div>

            {!formData.permanent && (
              <div className="form-group">
                <label htmlFor="hours">Validity (hours)</label>
                <input
                  type="number"
                  id="hours"
                  name="hours"
                  value={formData.hours}
                  onChange={handleInputChange}
                  placeholder="Leave empty for 24 hours"
                  min="1"
                  disabled={loading}
                />
                <small>Leave empty for default (24 hours)</small>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? '⏳ Creating...' : '✓ Create Admin'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users List */}
      <div className="users-section">
        <div className="section-header">
          <h3>Admin Users List</h3>
          <button
            onClick={fetchUsers}
            className="btn-refresh"
            disabled={loading}
          >
            🔄 Refresh
          </button>
        </div>

        {loading && users.length === 0 ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading admin users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👤</div>
            <h4>No Admin Users</h4>
            <p>Create your first admin user to get started</p>
          </div>
        ) : (
          <div className="users-table">
            <div className="table-header">
              <div className="header-cell">Username</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Expiry</div>
              <div className="header-cell">Created</div>
              <div className="header-cell">Last Login</div>
              <div className="header-cell">Actions</div>
            </div>
            {users.map((user) => (
              <div key={user.id} className="table-row">
                <div className="table-cell">
                  <strong>{user.username}</strong>
                </div>
                <div className="table-cell">
                  {getStatusBadge(user)}
                </div>
                <div className="table-cell">
                  {getExpiryInfo(user)}
                </div>
                <div className="table-cell">
                  {formatDate(user.created_at)}
                </div>
                <div className="table-cell">
                  {formatDate(user.last_login_at)}
                </div>
                <div className="table-cell actions-cell">
                  <button
                      onClick={() => handleToggleStatus(user.id, user.status)}
                    className="btn-action btn-toggle"
                    disabled={loading}
                      title={user.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                  >
                      {user.status === 'ACTIVE' ? '🔒' : '🔓'}
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id, user.username)}
                    className="btn-action btn-delete"
                    disabled={loading}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminUsersManager;
