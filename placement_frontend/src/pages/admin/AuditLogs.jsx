import React, { useEffect, useState } from 'react';
import api from '../../services/api.js'; // ያንተን የaxios instance ተጠቀም

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

  // ዳታውን ከ PHP API ለመሳብ
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await api.get('api/admin/audit_logs_api.php');
      if (response.data?.success) {
        setLogs(Array.isArray(response.data.logs) ? response.data.logs : []);
        setSelectedIds([]);
      } else {
        setError(response.data?.message || 'Unable to load audit logs.');
      }
    } catch (err) {
      setError("Failed to load logs. Please ensure you are logged in as admin.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    const value = `${log.created_at} ${log.full_name} ${log.action} ${log.details}`.toLowerCase();
    return value.includes(searchText.toLowerCase());
  });

  const filteredLogIds = filteredLogs.map(log => String(log.id));
  const allFilteredSelected = filteredLogIds.length > 0
    && filteredLogIds.every(id => selectedIds.includes(id));

  const toggleLog = (id) => {
    const normalizedId = String(id);
    setSelectedIds(current => current.includes(normalizedId)
      ? current.filter(selectedId => selectedId !== normalizedId)
      : [...current, normalizedId]);
  };

  const toggleAllFiltered = () => {
    setSelectedIds(current => allFilteredSelected
      ? current.filter(id => !filteredLogIds.includes(id))
      : [...new Set([...current, ...filteredLogIds])]);
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0 || !window.confirm(`Delete ${selectedIds.length} selected log(s)?`)) return;

    setDeleting(true);
    setError(null);
    try {
      const response = await api.delete('api/admin/audit_logs_api.php', { data: { ids: selectedIds } });
      if (response.data?.success) {
        setLogs(current => current.filter(log => !selectedIds.includes(String(log.id))));
        setSelectedIds([]);
      } else {
        setError(response.data?.message || 'Unable to delete selected logs.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete selected logs.');
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="row g-4">
      <div className="col-12">
        <div className="card summary-card shadow-sm">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="card-title mb-0">System Audit Logs</h4>
              <div className="d-flex gap-2">
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={deleteSelected}
                  disabled={selectedIds.length === 0 || deleting}
                >
                  {deleting ? 'Deleting...' : `Delete selected${selectedIds.length ? ` (${selectedIds.length})` : ''}`}
                </button>
                <button className="btn btn-sm btn-outline-primary" onClick={fetchLogs} disabled={loading || deleting}>Refresh</button>
              </div>
            </div>
            
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="mb-4">
              <input
                type="search"
                className="form-control"
                placeholder="Search logs by user, action or date..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
            </div>

            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all visible logs"
                        checked={allFilteredSelected}
                        onChange={toggleAllFiltered}
                        disabled={filteredLogIds.length === 0 || loading || deleting}
                      />
                    </th>
                    <th>Date & Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Details</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="6" className="text-center py-4">Loading logs...</td></tr>
                  ) : filteredLogs.length > 0 ? (
                    filteredLogs.map(log => (
                      <tr key={log.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select log ${log.id}`}
                            checked={selectedIds.includes(String(log.id))}
                            onChange={() => toggleLog(log.id)}
                            disabled={deleting}
                          />
                        </td>
                        <td style={{fontSize: '0.85rem'}}>{new Date(log.created_at).toLocaleString()}</td>
                        <td><strong>{log.full_name || 'System'}</strong></td>
                        <td><span className="badge bg-info text-dark">{log.action}</span></td>
                        <td><small>{log.details}</small></td>
                        <td><code style={{fontSize: '0.75rem'}}>{log.ip_address}</code></td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="6" className="text-center py-4 text-muted">No logs found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;