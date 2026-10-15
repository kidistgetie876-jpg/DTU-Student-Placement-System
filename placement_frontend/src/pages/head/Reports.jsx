import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaTrash } from 'react-icons/fa';
import { FaPaperclip } from 'react-icons/fa';
import { ChevronDown, ChevronUp, Eye } from 'lucide-react';
import api from '../../services/api';
import getAttachmentUrl from '../../utils/getAttachmentUrl';

const handleOpenAttachment = (filePath, notificationId) => {
  const attachmentUrl = getAttachmentUrl(filePath, notificationId);
  if (attachmentUrl !== '#') window.open(attachmentUrl, '_blank', 'noopener,noreferrer');
};

const Reports = ({ leader, department, students = [] }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recipientType, setRecipientType] = useState('student');
  const [studentId, setStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [message, setMessage] = useState('');
  const [reportFile, setReportFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [sendStatus, setSendStatus] = useState({ type: '', message: '' });
  const [expandedReportId, setExpandedReportId] = useState(null);
  const fileInputRef = useRef(null);

  const loadReports = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('api/head/get_head_reports.php');
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to load reports.');
      setReports(Array.isArray(response.data.reports) ? response.data.reports : []);
    } catch (requestError) {
      setReports([]);
      setError(requestError.response?.data?.message || requestError.message || 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leader) loadReports();
  }, [leader]);

  const filteredStudents = useMemo(() => {
    const search = studentSearch.trim().toLowerCase();
    if (!search) return students;
    return students.filter((student) => [student.id, student.student_id, student.username, student.name, student.full_name, student.email].some((value) => String(value || '').toLowerCase().includes(search)));
  }, [students, studentSearch]);

  const sendMessage = async (event) => {
    event.preventDefault();
    setSendStatus({ type: '', message: '' });
    if (!message.trim()) {
      setSendStatus({ type: 'danger', message: 'Enter a message before sending.' });
      return;
    }
    if (recipientType === 'student' && !studentId) {
      setSendStatus({ type: 'danger', message: 'Search for and select a student.' });
      return;
    }
    if (reportFile && reportFile.size > 10 * 1024 * 1024) {
      setSendStatus({ type: 'danger', message: 'Attachments must be 10 MB or smaller.' });
      return;
    }

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('sender_id', String(leader?.id ?? leader?.user_id ?? ''));
      formData.append('sender_role', 'head');
      formData.append('recipient_type', recipientType);
      formData.append('recipient_role', recipientType === 'registrar' ? 'registrar' : 'student');
      formData.append('dept_id', String(department?.id ?? leader?.department_id ?? ''));
      formData.append('message', message.trim());
      if (recipientType === 'student') {
        formData.append('recipient_id', String(Number(studentId)));
        formData.append('student_id', String(Number(studentId)));
      }
      if (reportFile) formData.append('report_file', reportFile);
      const response = await api.post('api/head/send_head_message.php', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to send message.');
      setMessage('');
      setStudentId('');
      setStudentSearch('');
      setReportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSendStatus({ type: 'success', message: '✓ Report/message sent successfully!' });
      await loadReports();
    } catch (requestError) {
      setSendStatus({ type: 'danger', message: requestError.response?.data?.message || requestError.message || 'Unable to send message.' });
    } finally {
      setSending(false);
    }
  };

  const markAsRead = async (report) => {
    if (report.is_read || report.direction === 'sent') return;
    try {
      await api.post('api/head/mark_report_read.php', { notification_id: report.id });
      setReports((current) => current.map((item) => item.id === report.id ? { ...item, is_read: true } : item));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to mark report as read.');
    }
  };

  const deleteReport = async (report) => {
    if (!window.confirm('Delete this message?')) return;
    setDeletingId(report.id);
    try {
      const response = await api.post('api/head/delete_head_report.php', { notification_id: report.id });
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to delete message.');
      setReports((current) => current.filter((item) => item.id !== report.id));
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to delete message.');
    } finally {
      setDeletingId(null);
    }
  };

  const clearHistory = async () => {
    if (!reports.length || !window.confirm('Permanently delete all reports in your history? This cannot be undone.')) return;
    setClearingHistory(true);
    setError('');
    try {
      const response = await api.post('api/head/clear_head_report_history.php');
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to clear report history.');
      setReports([]);
      setExpandedReportId(null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to clear report history.');
    } finally {
      setClearingHistory(false);
    }
  };

  const unreadCount = reports.filter((report) => report.direction !== 'sent' && !Number(report.is_read)).length;

  return (
    <div className="card analytics-card">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 className="card-title mb-1">Report Notifications</h5>
            <p className="text-muted mb-0">Send messages to the Registrar or students in your department.</p>
          </div>
          <div className="d-flex align-items-center gap-2">
            {unreadCount > 0 && <span className="badge bg-primary">{unreadCount} unread</span>}
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={clearHistory} disabled={!reports.length || clearingHistory || loading}>
              {clearingHistory ? 'Deleting...' : 'Clear History'}
            </button>
          </div>
        </div>

        <form className="border rounded p-3 mb-4" onSubmit={sendMessage}>
          <h6 className="mb-3">Send Message</h6>
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label small fw-semibold" htmlFor="head-message-recipient">Send to</label>
              <select id="head-message-recipient" className="form-select" value={recipientType} onChange={(event) => { setRecipientType(event.target.value); setStudentId(''); setStudentSearch(''); }} disabled={sending}>
                <option value="student">Individual Student</option>
                <option value="all_students">All Students in Department</option>
                <option value="registrar">Registrar</option>
              </select>
            </div>
            {recipientType === 'student' && (
              <div className="col-md-4">
                <label className="form-label small fw-semibold" htmlFor="head-student-search">Search by ID or name</label>
                <input id="head-student-search" className="form-control mb-2" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} disabled={sending} placeholder="Student ID, username, or name" />
                <select className="form-select" value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={sending}>
                  <option value="">Select a student</option>
                  {filteredStudents.map((student) => {
                    const id = student.student_id || student.id;
                    return <option key={id} value={id}>{student.username || student.name || student.full_name || student.email || `Student ${id}`} (ID: {id})</option>;
                  })}
                </select>
              </div>
            )}
            <div className={recipientType === 'student' ? 'col-md-4' : 'col-md-8'}>
              <label className="form-label small fw-semibold" htmlFor="head-message-text">Message</label>
              <textarea id="head-message-text" className="form-control" rows="3" value={message} onChange={(event) => setMessage(event.target.value)} maxLength="10000" placeholder="Write a message" disabled={sending} />
            </div>
            <div className="col-12">
              <label className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-2 mb-0">
                <FaPaperclip aria-hidden="true" />
                Bulk Upload Report / Attach File
                <input
                  ref={fileInputRef}
                  type="file"
                  className="visually-hidden"
                  accept=".pdf,.xls,.xlsx,.doc,.docx"
                  disabled={sending}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    if (file && !/\.(pdf|xls|xlsx|doc|docx)$/i.test(file.name)) {
                      event.target.value = '';
                      setReportFile(null);
                      setSendStatus({ type: 'danger', message: 'Choose a PDF, Excel, or Word document.' });
                      return;
                    }
                    if (file && file.size > 10 * 1024 * 1024) {
                      event.target.value = '';
                      setReportFile(null);
                      setSendStatus({ type: 'danger', message: 'Attachments must be 10 MB or smaller.' });
                      return;
                    }
                    setReportFile(file);
                    setSendStatus({ type: '', message: '' });
                  }}
                />
              </label>
              {reportFile && (
                <div className="d-flex align-items-center gap-2 mt-2 small">
                  <span className="text-muted">Selected: {reportFile.name}</span>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0"
                    onClick={() => {
                      setReportFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={sending}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            <div className="col-12 d-flex justify-content-end">
              <div className="d-flex flex-column align-items-end">
                <button type="submit" className="btn btn-primary" disabled={sending || (recipientType === 'student' && students.length === 0)}>{sending ? 'Sending...' : 'Send Message'}</button>
                {sendStatus.message && <div className={`alert alert-${sendStatus.type} mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0`} role={sendStatus.type === 'danger' ? 'alert' : 'status'}>{sendStatus.message}</div>}
              </div>
            </div>
          </div>
          {recipientType === 'student' && students.length === 0 && <small className="text-muted d-block mt-2">No students are currently assigned to this department.</small>}
        </form>

        {loading && <div className="alert alert-info mb-0">Loading reports...</div>}
        {!loading && error && <div className="alert alert-danger mb-0">{error}</div>}
        {!loading && !error && reports.length === 0 && <div className="alert alert-light border mb-0">No reports have been sent or received.</div>}
        {!loading && !error && reports.length > 0 && (
          <div className="list-group">
            {reports.map((report) => {
              const isExpanded = expandedReportId === report.id;
              const category = report.file_path ? 'Report' : 'Message';
              const sender = report.direction === 'sent'
                ? 'You'
                : report.sender_role || 'Office';
              const summary = String(report.message || '').replace(/\s+/g, ' ').trim();

              return (
                <article
                  className={`list-group-item p-0 ${report.direction !== 'sent' && !Number(report.is_read) ? 'border-start border-4 border-primary' : ''}`}
                  key={report.id}
                >
                  <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap p-3">
                    <div className="flex-grow-1 overflow-hidden">
                      <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                        <strong className="text-truncate">{report.title || (category === 'Report' ? 'Department Report' : 'Report Message')}</strong>
                        <span className="badge bg-primary-subtle text-primary-emphasis">{category}</span>
                        {report.direction !== 'sent' && !Number(report.is_read) && (
                          <span className="badge bg-info-subtle text-info-emphasis">Unread</span>
                        )}
                      </div>
                      <div className="small text-muted mb-1">
                        <span>Created {report.created_at || 'date unavailable'}</span>
                        <span> · Generated by {sender}</span>
                      </div>
                      <div className="small text-muted text-truncate" title={summary}>
                        {summary || 'No description provided.'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2 flex-shrink-0"
                      aria-expanded={isExpanded}
                      aria-controls={`report-details-${report.id}`}
                      onClick={() => {
                        const nextId = isExpanded ? null : report.id;
                        setExpandedReportId(nextId);
                        if (nextId !== null) markAsRead(report);
                      }}
                    >
                      <Eye size={16} aria-hidden="true" />
                      {isExpanded ? 'Hide Details' : 'View Details'}
                      {isExpanded
                        ? <ChevronUp size={16} aria-hidden="true" />
                        : <ChevronDown size={16} aria-hidden="true" />}
                    </button>
                  </div>
                  {isExpanded && (
                    <section
                      id={`report-details-${report.id}`}
                      className="border-top p-3"
                      aria-label={`Details for ${report.title || category}`}
                    >
                      <h6 className="fw-semibold mb-2">Full details</h6>
                      <p className="mb-3 text-break" style={{ whiteSpace: 'pre-wrap' }}>
                        {report.message || 'No description provided.'}
                      </p>
                      <div className="small text-muted d-flex flex-wrap gap-2 mb-3">
                        <span>Direction: {report.direction === 'sent' ? 'Sent' : 'Received'}</span>
                        <span>Generated by: {report.sender_role || 'Office'}</span>
                        <span>Recipient: {report.recipient_role || 'Not specified'}</span>
                        <span>Created: {report.created_at || 'Date unavailable'}</span>
                        <span>Status: {Number(report.is_read) ? 'Read' : 'Unread'}</span>
                        <span>Notification ID: {report.id}</span>
                      </div>
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        {report.file_path && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleOpenAttachment(report.file_path, report.id)}
                          >
                            Open attachment
                          </button>
                        )}
                        {report.direction === 'sent' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-2"
                            title="Delete message"
                            onClick={() => deleteReport(report)}
                            disabled={deletingId === report.id}
                          >
                            <FaTrash aria-hidden="true" />
                            {deletingId === report.id ? 'Deleting...' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </section>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
