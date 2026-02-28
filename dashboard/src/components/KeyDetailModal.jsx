import { useState, useEffect, useRef } from 'react';
import './KeyDetailModal.css';

function KeyDetailModal({ keyData, onClose, onSave, onDelete }) {
  const [status, setStatus] = useState(keyData.active && !isExpired(keyData.expiry) ? 'ACTIVE' : 'REVOKED');
  const [expiresAt, setExpiresAt] = useState(formatDateTimeLocal(keyData.expiry));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const overlayRef = useRef(null);

  function isExpired(dateStr) {
    return new Date(dateStr) < new Date();
  }

  function formatDateTimeLocal(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    // Format for datetime-local input: YYYY-MM-DDTHH:MM
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatDisplay(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  }

  function getTimeRemaining(dateStr) {
    if (!dateStr) return 'N/A';
    const now = new Date();
    const exp = new Date(dateStr);
    const diff = exp - now;

    if (diff <= 0) return 'Expirada';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.join(' ') || '< 1m';
  }

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on overlay click
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleCopyKeyId = async () => {
    try {
      await navigator.clipboard.writeText(keyData.keyId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    const updates = {};

    // Check if status changed
    const currentIsActive = keyData.active && !isExpired(keyData.expiry);
    const currentStatus = currentIsActive ? 'ACTIVE' : 'REVOKED';
    if (status !== currentStatus) {
      updates.status = status;
    }

    // Check if expiry changed
    const originalExpiry = formatDateTimeLocal(keyData.expiry);
    if (expiresAt !== originalExpiry) {
      updates.expires_at = new Date(expiresAt).toISOString();
    }

    if (Object.keys(updates).length === 0) {
      setError('Nenhuma alteração detectada');
      setSaving(false);
      return;
    }

    try {
      await onSave(keyData.keyId, updates);
      setSuccess('Chave atualizada com sucesso');
      setTimeout(() => onClose(), 800);
    } catch (err) {
      setError(err.message || 'Erro ao salvar');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setError('');
    try {
      await onDelete(keyData.keyId);
      onClose();
    } catch (err) {
      setError(err.message || 'Erro ao deletar');
    }
    setDeleting(false);
    setConfirmDelete(false);
  };

  const statusIsActive = status === 'ACTIVE' && !isExpired(expiresAt);

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="modal-container">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-icon">🔑</span>
            <h2>Detalhes da Chave</h2>
          </div>
          <button className="modal-close" onClick={onClose} title="Fechar">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="modal-body">
          {/* Status messages */}
          {error && <div className="modal-alert error">{error}</div>}
          {success && <div className="modal-alert success">{success}</div>}

          {/* Key ID (read-only, copyable) */}
          <div className="modal-field">
            <label>Key ID</label>
            <code className="key-code clickable" onClick={handleCopyKeyId} title="Clique para copiar">
              {keyData.keyId}
              {copied && <span className="copied-tooltip">Copiado!</span>}
            </code>
          </div>

          {/* Info grid */}
          <div className="modal-info-grid">
            <div className="info-item">
              <span className="info-label">User ID</span>
              <span className="info-value">{keyData.userId || 'N/A'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Criada em</span>
              <span className="info-value">{formatDisplay(keyData.created)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Último acesso</span>
              <span className="info-value">{formatDisplay(keyData.lastAccessed)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Usos</span>
              <span className="info-value">{keyData.usage ?? 0}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Tempo restante</span>
              <span className={`info-value ${isExpired(expiresAt) ? 'text-red' : 'text-green'}`}>
                {getTimeRemaining(expiresAt)}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">IP de criação</span>
              <span className="info-value">{keyData.ipAddress || 'N/A'}</span>
            </div>
          </div>

          <div className="modal-divider" />

          {/* Editable fields */}
          <h3 className="modal-section-title">Editar</h3>

          <div className="modal-field">
            <label>Status</label>
            <div className="status-toggle">
              <button
                className={`toggle-btn ${status === 'ACTIVE' ? 'active' : ''}`}
                onClick={() => setStatus('ACTIVE')}
              >
                Ativa
              </button>
              <button
                className={`toggle-btn ${status === 'REVOKED' ? 'active revoked' : ''}`}
                onClick={() => setStatus('REVOKED')}
              >
                Revogada
              </button>
            </div>
          </div>

          <div className="modal-field">
            <label>Data de expiração</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="modal-input"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className={`modal-btn delete ${confirmDelete ? 'confirm' : ''}`}
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deletando...' : confirmDelete ? 'Confirmar exclusão' : 'Deletar'}
          </button>
          <div className="modal-footer-right">
            <button className="modal-btn cancel" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="modal-btn save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default KeyDetailModal;
