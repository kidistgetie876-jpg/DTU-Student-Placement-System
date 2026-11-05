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

const isPlacementBatchAnnouncement = (report) => (
  String(report.sender_role || '').trim().toLowerCase() === 'registrar'
  && /^official placement approved:\s*new students assigned$/i.test(String(report.title || '').trim())
);

const Reports = ({ leader, department, students = [] }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedReports, setHasLoadedReports] = useState(false);
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
      if (!Array.isArray(response.data.reports)) {
        throw new Error('The reports service returned an invalid response.');
      }
      setReports(response.data.reports.filter(Boolean));
      setHasLoadedReports(true);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leader) loadReports();
  }, [leader]);

  const filteredStudents = useMemo(() => {
    const studentList = Array.isArray(students) ? students.filter(Boolean) : [];
    const search = studentSearch.trim().toLowerCase();
    if (!search) return studentList;
    return studentList.filter((student) => [
      student.account_id,
      student.id,
      student.student_id,
      student.university_student_id,
      student.username,
      student.name,
      student.full_name,
      student.email,
    ].some((value) => String(value || '').toLowerCase().includes(search)));
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
  const visibleReports = reports.filter((report) => !isPlacementBatchAnnouncement(report));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="mb-0 text-xl font-bold text-slate-900">Report Notifications</h2>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">{unreadCount} unread</span>}
            <button type="button" className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={clearHistory} disabled={!reports.length || clearingHistory || loading}>
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
                  {filteredStudents.map((student, index) => {
                    const studentIdValue = String(student.student_id ?? '');
                    const id = student.account_id
                      ?? student.id
                      ?? (/^\d+$/.test(studentIdValue) ? studentIdValue : '');
                    const studentLabel = student.username || student.name || student.full_name || student.email || `Student ${index + 1}`;
                    const displayedId = student.university_student_id || student.id_number || student.student_id;
                    return (
                      <option key={`${id ?? 'student'}-${index}`} value={id ?? ''}>
                        {studentLabel}{displayedId !== null && displayedId !== undefined && displayedId !== '' ? ` (ID: ${displayedId})` : ''}
                      </option>
                    );
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
        </form>

        {loading && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900" role="status">Loading reports...</div>}
        {!loading && error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</div>}
        {!loading && hasLoadedReports && !error && reports.length === 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">No reports have been sent or received.</div>}
        {!loading && visibleReports.length > 0 && (
          <div className="space-y-3">
            {visibleReports.map((report, index) => {
              const isExpanded = expandedReportId === report.id;
              const category = report.file_path ? 'Report' : 'Message';
              const sender = report.direction === 'sent'
                ? 'You'
                : report.sender_role || 'Office';
              const normalizedSender = String(sender).replace(/[_-]+/g, ' ');
              const reportType = `${report.title || ''} ${report.message || ''}`;
              const isApprovedPlacement = /approved.*placement|placement.*approved/i.test(reportType);
              const categoryClasses = isApprovedPlacement
                ? 'bg-emerald-100 text-emerald-800'
                : category === 'Message'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-900';

              return (
                <article
                  className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md ${report.direction !== 'sent' && !Number(report.is_read) ? 'border-l-4 border-l-blue-600' : ''}`}
                  key={`${report.id ?? 'report'}-${index}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="mb-0 text-base font-bold text-slate-900">{report.title || (category === 'Report' ? 'Department Report' : 'Report Message')}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${categoryClasses}`}>{isApprovedPlacement ? 'Approved Placement' : category}</span>
                        {report.direction !== 'sent' && !Number(report.is_read) && (
                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">Unread</span>
                        )}
                      </div>
                      <div className="mb-3 text-xs text-slate-500">
                        {report.created_at || 'Date unavailable'} <span aria-hidden="true">·</span> From {normalizedSender}
                      </div>
                      <p className="mb-0 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{report.message || 'No message provided.'}</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      aria-expanded={isExpanded}
                      aria-controls={`report-details-${report.id}`}
                      onClick={() => {
                        const nextId = isExpanded ? null : report.id;
                        setExpandedReportId(nextId);
                        if (nextId !== null) markAsRead(report);
                      }}
                    >
                      <Eye size={16} aria-hidden="true" />
                      {isExpanded ? 'Hide actions' : 'More actions'}
                      {isExpanded
                        ? <ChevronUp size={16} aria-hidden="true" />
                        : <ChevronDown size={16} aria-hidden="true" />}
                    </button>
                  </div>
                  {isExpanded && (
                    <section
                      id={`report-details-${report.id}`}
                      className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4"
                      aria-label={`Details for ${report.title || category}`}
                    >
                      {report.recipient_role && <span className="mr-auto text-xs text-slate-500">To {String(report.recipient_role).replace(/[_-]+/g, ' ')}</span>}
                      {!report.recipient_role && <span className="mr-auto" aria-hidden="true" />}
                      {report.file_path && (
                          <button
                            type="button"
                            className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
                            onClick={() => handleOpenAttachment(report.file_path, report.id)}
                          >
                            Open attachment
                          </button>
                      )}
                      {report.direction === 'sent' && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Delete message"
                            onClick={() => deleteReport(report)}
                            disabled={deletingId === report.id}
                          >
                            <FaTrash aria-hidden="true" />
                            {deletingId === report.id ? 'Deleting...' : 'Delete'}
                          </button>
                      )}
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
