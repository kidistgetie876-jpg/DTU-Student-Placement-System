import React, { useEffect, useRef, useState } from 'react';
import api from '../../services/api.js';

const EMPTY_STATUS = { type: '', message: '' };
const ALLOWED_FILE_EXTENSIONS = ['pdf', 'xls', 'xlsx', 'doc', 'docx'];
<<<<<<< HEAD:placement_frontend/src/pages/admin/AdminReports.jsx
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
=======
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:src/pages/admin/AdminReports.jsx

const getAttachmentUrl = (report) => {
  const fileUrl = report.file_url || report.file_path;
  if (!fileUrl) return null;

  try {
    return new URL(fileUrl, api.defaults.baseURL).toString();
  } catch (error) {
    return fileUrl;
  }
};

const AdminReports = () => {
  const [reports, setReports] = useState([]);
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const loadReports = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('api/admin/get_admin_reports.php');
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to load reports.');
      setReports(Array.isArray(response.data.reports) ? response.data.reports : []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_FILE_EXTENSIONS.includes(extension)) {
      setSelectedFile(null);
      event.target.value = '';
      setStatus({ type: 'danger', message: 'Choose a PDF, Excel, or Word file.', action: 'send' });
      return;
    }
<<<<<<< HEAD:placement_frontend/src/pages/admin/AdminReports.jsx
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setSelectedFile(null);
      event.target.value = '';
      setStatus({ type: 'danger', message: 'Attachments must be 10 MB or smaller.', action: 'send' });
      return;
    }
=======
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:src/pages/admin/AdminReports.jsx

    setStatus(EMPTY_STATUS);
    setSelectedFile(file);
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    setStatus(EMPTY_STATUS);
    const trimmedMessage = message.trim();
    const trimmedSubject = subject.trim();

    if (!trimmedMessage) {
      setStatus({ type: 'danger', message: 'Write a message before sending.', action: 'send' });
      return;
    }
    if (trimmedMessage.length > 10000) {
      setStatus({ type: 'danger', message: 'The message must be 10,000 characters or fewer.', action: 'send' });
      return;
    }

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('subject', trimmedSubject);
      formData.append('message', trimmedMessage);
      formData.append('sender_role', 'admin');
      formData.append('recipient_role', 'registrar');
      if (selectedFile) formData.append('file', selectedFile);

      const response = await api.post('api/admin/send_message.php', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to send message.');
      setSubject('');
      setMessage('');
      removeSelectedFile();
      setStatus({ type: 'success', message: response.data.message || 'Message sent to the Registrar.', action: 'send' });
      await loadReports();
    } catch (requestError) {
      setStatus({ type: 'danger', message: requestError.response?.data?.message || requestError.message || 'Unable to send message.', action: 'send' });
    } finally {
      setSending(false);
    }
  };

  const deleteReport = async (reportId) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      const response = await api.post('api/admin/delete_report.php', { report_id: reportId });
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to delete message.');
      setReports((current) => current.filter((report) => report.id !== reportId));
    } catch (requestError) {
      setStatus({ type: 'danger', message: requestError.response?.data?.message || requestError.message || 'Unable to delete message.', action: 'delete', reportId });
    }
  };

  const markRead = async (report) => {
    if (report.is_read || report.direction !== 'received') return;
    try {
      await api.post('api/admin/mark_report_read.php', { report_id: report.id });
      setReports((current) => current.map((item) => item.id === report.id ? { ...item, is_read: 1 } : item));
    } catch (requestError) {
      setStatus({ type: 'danger', message: requestError.response?.data?.message || 'Unable to update message status.', action: 'read', reportId: report.id });
    }
  };

  const unreadCount = reports.filter((report) => report.direction === 'received' && !Number(report.is_read)).length;

  return (
    <section className="card analytics-card">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center gap-3 mb-4">
          <div>
            <h3 className="card-title mb-1">Reports Communication Hub</h3>
            <p className="text-muted mb-0">Send messages to and manage communication with the Registrar.</p>
          </div>
          <span className="badge bg-primary">{unreadCount} unread</span>
        </div>

        <form className="border rounded p-3 mb-4" onSubmit={sendMessage}>
          <h5 className="mb-3">New message to Registrar</h5>
          <div className="mb-3">
            <label className="form-label fw-semibold" htmlFor="admin-report-subject">Subject</label>
            <input id="admin-report-subject" className="form-control" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength="180" disabled={sending} placeholder="Optional subject" />
          </div>
          <div className="mb-3">
            <label className="form-label fw-semibold" htmlFor="admin-report-message">Message</label>
            <textarea id="admin-report-message" className="form-control" rows="4" value={message} onChange={(event) => setMessage(event.target.value)} maxLength="10000" disabled={sending} placeholder="Write your message" required />
          </div>
          <div className="mb-3">
            <label className="form-label fw-semibold" htmlFor="admin-report-file">Attachment (optional)</label>
            <input
              ref={fileInputRef}
              id="admin-report-file"
              className="form-control"
              type="file"
              accept=".pdf,.xls,.xlsx,.doc,.docx"
              onChange={handleFileChange}
              disabled={sending}
            />
            {selectedFile && (
              <div className="d-flex align-items-center gap-2 mt-2">
                <span className="text-muted small">Selected: {selectedFile.name}</span>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={removeSelectedFile} disabled={sending}>
                  Remove
                </button>
              </div>
            )}
          </div>
          <button type="submit" className="btn btn-primary" disabled={sending}>{sending ? 'Sending...' : 'Send to Registrar'}</button>
          {status.action === 'send' && status.message && (
            <div className={`alert alert-${status.type} mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0`} role="status">
              {status.message}
            </div>
          )}
        </form>

        <h5 className="mb-3">Conversation history</h5>
        {loading && <div className="alert alert-info">Loading messages...</div>}
        {!loading && error && <div className="alert alert-danger">{error}</div>}
        {!loading && !error && reports.length === 0 && <div className="alert alert-light border">No messages yet.</div>}
        {!loading && !error && reports.length > 0 && (
          <div className="list-group">
            {reports.map((report) => (
              <article key={report.id} className={`list-group-item ${report.direction === 'received' && !Number(report.is_read) ? 'fw-semibold' : ''}`} onClick={() => markRead(report)}>
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <span className={`badge ${report.direction === 'received' ? 'bg-success' : 'bg-secondary'} me-2`}>{report.direction === 'received' ? 'From Registrar' : 'Sent to Registrar'}</span>
                    {report.title && <strong>{report.title}</strong>}
                  </div>
                  <small className="text-muted text-nowrap">{report.created_at}</small>
                </div>
                <p className="mb-2 mt-2">{report.message}</p>
                {getAttachmentUrl(report) && (
                  <a className="btn btn-sm btn-outline-primary me-2" href={getAttachmentUrl(report)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                    Download Attachment
                  </a>
                )}
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={(event) => { event.stopPropagation(); deleteReport(report.id); }}>Delete</button>
                {status.message && status.reportId === report.id && status.action !== 'send' && (
                  <div className={`alert alert-${status.type} mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0`} role="status">
                    {status.message}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default AdminReports;