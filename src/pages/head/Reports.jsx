import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaTrash } from 'react-icons/fa';
import { FaPaperclip } from 'react-icons/fa';
import api from '../../services/api';

const Reports = ({ leader, department, students }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [sendTo, setSendTo] = useState('individual');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reportsError, setReportsError] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  const loadReports = async () => {
    setLoading(true);
    setReportsError('');
    try {
      const response = await api.get('api/head/get_head_reports.php');
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to load reports.');
      setReports(Array.isArray(response.data.reports) ? response.data.reports : []);
    } catch (requestError) {
      setReports([]);
      setReportsError(requestError.response?.data?.message || requestError.message || 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leader) loadReports();
  }, [leader]);

  const studentList = useMemo(() => (Array.isArray(students) ? students : []), [students]);
  const filteredStudents = useMemo(() => {
    const query = studentSearch.toLowerCase().trim();
    return studentList.filter((student) => {
      if (!query) return true;
      const idStr = String(student.id_number || student.student_id || student.id || student.user_id || '').toLowerCase();
      const nameStr = String(
        student.full_name
        || student.username
        || [student.first_name, student.last_name].filter(Boolean).join(' ')
        || student.name
        || ''
      ).toLowerCase();
      return idStr.includes(query) || nameStr.includes(query);
    });
  }, [studentList, studentSearch]);

  const isIndividualRecipient = sendTo === 'individual';

  useEffect(() => {
    if (!isIndividualRecipient || selectedStudentId || filteredStudents.length === 0) return;
    const firstStudent = filteredStudents[0];
    const firstStudentId = firstStudent.id || firstStudent.student_id || firstStudent.user_id;
    if (firstStudentId !== null && firstStudentId !== undefined && firstStudentId !== '') {
      setSelectedStudentId(String(firstStudentId));
    }
  }, [isIndividualRecipient, selectedStudentId, filteredStudents]);

  const handleSendMessage = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const trimmedMessage = (message || '').trim();
    if (!trimmedMessage && !selectedFile) {
      setError('Please enter a message or attach a report file.');
      return;
    }
    if (selectedFile && selectedFile.size > 10 * 1024 * 1024) {
      setError('Attachments must be 10 MB or smaller.');
      return;
    }

    const firstStudent = filteredStudents[0];
    const recipientId = selectedStudentId || firstStudent?.id || firstStudent?.student_id || firstStudent?.user_id;

    if (isIndividualRecipient && (!recipientId || !Number.isFinite(Number(recipientId)) || Number(recipientId) <= 0)) {
      setError('Please select a valid student from the dropdown.');
      return;
    }

    const formData = new FormData();
    formData.append('sender_id', String(leader?.id ?? leader?.user_id ?? ''));
    formData.append('sender_role', 'head');
    formData.append('dept_id', String(leader?.department_id ?? department?.id ?? ''));
    formData.append('message', (message || '').trim());
    if (selectedFile) formData.append('report_file', selectedFile);

    if (sendTo === 'registrar') {
      formData.append('recipient_type', 'registrar');
      formData.append('recipient_role', 'registrar');
    } else if (isIndividualRecipient) {
      formData.append('recipient_type', 'student');
      formData.append('recipient_role', 'student');
      formData.append('recipient_id', String(Number(recipientId)));
    } else {
      formData.append('recipient_type', 'all_students');
      formData.append('recipient_role', 'student');
      formData.append('target_all', '1');
    }

    setSending(true);
    try {
      const response = await api.post('api/head/send_head_message.php', formData);
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to send message.');
      setMessage('');
      setSelectedStudentId('');
      setStudentSearch('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSuccess('✓ Report/message sent successfully!');
      await loadReports();
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to send message.');
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
      setReportsError(requestError.response?.data?.message || 'Unable to mark report as read.');
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
      setReportsError(requestError.response?.data?.message || requestError.message || 'Unable to delete message.');
    } finally {
      setDeletingId(null);
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
          {unreadCount > 0 && <span className="badge bg-primary">{unreadCount} unread</span>}
        </div>

        <form className="border rounded p-3 mb-4" onSubmit={handleSendMessage}>
          <h6 className="mb-3">Send Message</h6>
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label small fw-semibold" htmlFor="head-message-recipient">Send to</label>
              <select id="head-message-recipient" className="form-select" value={sendTo} onChange={(event) => { setSendTo(event.target.value); setSelectedStudentId(''); setStudentSearch(''); setError(''); setSuccess(''); }} disabled={sending}>
                <option value="individual">Individual Student</option>
                <option value="all">All Students in Department</option>
                <option value="registrar">Registrar</option>
              </select>
            </div>
            {isIndividualRecipient && (
              <div className="col-md-4">
                <label className="form-label small fw-semibold" htmlFor="head-student-search">Search by ID or name</label>
                <input id="head-student-search" className="form-control mb-2" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} disabled={sending} placeholder="Student ID, username, or name" />
                <select
                  className="form-select"
                  value={selectedStudentId || String(filteredStudents[0]?.id || filteredStudents[0]?.student_id || filteredStudents[0]?.user_id || '')}
                  onChange={(event) => setSelectedStudentId(event.target.value)}
                  disabled={sending}
                >
                  <option value="">-- Select a student --</option>
                  {filteredStudents.map((student) => {
                    const studentUid = student.id || student.student_id || student.user_id;
                    const studentDisplayId = student.id_number || student.student_id || studentUid;
                    const studentFullName = student.full_name
                      || `${student.first_name || ''} ${student.last_name || ''}`.trim()
                      || student.username
                      || student.name
                      || `Student #${studentUid}`;

                    return (
                      <option key={studentUid} value={studentUid}>
                        {studentFullName} ({studentDisplayId})
                      </option>
                    );
                  })}
                </select>
                {studentList.length === 0 && (
                  <div className="alert alert-info mt-2 mb-0">
                    No students are officially placed in your department yet. Once the Registrar approves students into your department, they will appear in this dropdown.
                  </div>
                )}
                {studentList.length > 0 && filteredStudents.length === 0 && (
                  <small className="text-muted d-block mt-2">No students match that search.</small>
                )}
              </div>
            )}
            <div className={isIndividualRecipient ? 'col-md-4' : 'col-md-8'}>
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
                      setSelectedFile(null);
                      setError('Choose a PDF, Excel, or Word document.');
                      setSuccess('');
                      return;
                    }
                    if (file && file.size > 10 * 1024 * 1024) {
                      event.target.value = '';
                      setSelectedFile(null);
                      setError('Attachments must be 10 MB or smaller.');
                      setSuccess('');
                      return;
                    }
                    setSelectedFile(file);
                    setError('');
                    setSuccess('');
                  }}
                />
              </label>
              {selectedFile && (
                <div className="d-flex align-items-center gap-2 mt-2 small">
                  <span className="text-muted">Selected: {selectedFile.name}</span>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0"
                    onClick={() => {
                      setSelectedFile(null);
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
                <button type="submit" className="btn btn-primary" disabled={sending || (isIndividualRecipient && studentList.length === 0)}>{sending ? 'Sending...' : 'Send Message'}</button>
                {error && <div className="alert alert-danger mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="alert">{error}</div>}
                {success && <div className="alert alert-success mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0" role="status">{success}</div>}
              </div>
            </div>
          </div>
        </form>

        {loading && <div className="alert alert-info mb-0">Loading reports...</div>}
        {!loading && reportsError && <div className="alert alert-danger mb-0">{reportsError}</div>}
        {!loading && !reportsError && reports.length === 0 && <div className="alert alert-light border mb-0">No reports have been sent or received.</div>}
        {!loading && !reportsError && reports.length > 0 && (
          <div className="list-group">
            {reports.map((report) => (
              <div className={`list-group-item ${report.direction !== 'sent' && !Number(report.is_read) ? 'fw-semibold' : ''}`} key={report.id} onClick={() => markAsRead(report)}>
                <div className="d-flex justify-content-between gap-3">
                  <span><span className={`badge ${report.direction === 'sent' ? 'bg-secondary' : 'bg-success'} me-2`}>{report.direction === 'sent' ? `Sent to ${report.recipient_role}` : `From ${report.sender_role || 'Office'}`}</span>{report.message}</span>
                  <small className="text-muted text-nowrap">{report.created_at}</small>
                </div>
                {report.title && <div className="text-muted small mt-1">{report.title}</div>}
                {report.file_url && <a className="btn btn-sm btn-outline-primary mt-2 me-2" href={report.file_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open attachment</a>}
                {report.direction === 'sent' && <button type="button" className="btn btn-sm btn-outline-danger mt-2" title="Delete message" aria-label="Delete message" onClick={(event) => { event.stopPropagation(); deleteReport(report); }} disabled={deletingId === report.id}><FaTrash aria-hidden="true" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
