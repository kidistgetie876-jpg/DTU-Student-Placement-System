import React, { useEffect, useState } from 'react';
import api from '../../services/api.js';

const fetchAppeals = async (studentId) => {
  const response = await api.get(`api/student/submit_appeal.php?student_id=${encodeURIComponent(studentId)}`);
  if (!response.data?.success) {
    throw new Error(response.data?.message || 'Unable to load appeals.');
  }
  return Array.isArray(response.data.appeals) ? response.data.appeals : [];
};

const StudentAppeal = ({ studentId, placement }) => {
  const [subject, setSubject] = useState('Placement appeal');
  const [message, setMessage] = useState('');
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingAppealId, setDeletingAppealId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const loadAppeals = async (id = studentId) => {
    if (!id) return;
    setLoading(true);
    try {
      setAppeals(await fetchAppeals(id));
    } catch (error) {
      setFeedback({ type: 'danger', text: error.response?.data?.message || error.message || 'Unable to load appeals.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!studentId) return;

    setLoading(true);
    fetchAppeals(studentId)
      .then(setAppeals)
      .catch((error) => {
        setFeedback({ type: 'danger', text: error.response?.data?.message || error.message || 'Unable to load appeals.' });
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setFeedback({ type: 'warning', text: 'Please enter a subject and explain your complaint.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await api.post('api/student/submit_appeal.php', {
        student_id: studentId,
        subject: subject.trim(),
        message: message.trim(),
        placement_department: placement?.assigned_department || '',
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to submit appeal.');
      }

      setMessage('');
      setFeedback({ type: 'success', text: response.data.message || 'Your appeal was submitted to the Registrar.' });
      await loadAppeals();
    } catch (error) {
      setFeedback({ type: 'danger', text: error.response?.data?.message || error.message || 'Unable to submit appeal.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (appeal) => {
    if (!window.confirm('Delete this appeal? This cannot be undone.')) return;

    setDeletingAppealId(appeal.id);
    setFeedback(null);
    try {
      const response = await api.post('api/student/submit_appeal.php', {
        action: 'delete',
        appeal_id: appeal.id,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to delete appeal.');
      }
      setAppeals((current) => current.filter((item) => item.id !== appeal.id));
      setFeedback({ type: 'success', text: response.data.message || 'Appeal deleted successfully.' });
    } catch (error) {
      setFeedback({ type: 'danger', text: error.response?.data?.message || error.message || 'Unable to delete appeal.' });
    } finally {
      setDeletingAppealId(null);
    }
  };

  return (
    <section className="student-appeal" aria-labelledby="student-appeal-title">
      <div className="student-appeal-heading">
        <div>
          <span className="student-section-eyebrow">REGISTRAR SUPPORT</span>
          <h2 id="student-appeal-title">Submit Appeal</h2>
          <p>Share your placement concern with the Registrar for review.</p>
        </div>
        <span className="badge rounded-pill text-bg-warning px-3 py-2">Registrar review</span>
      </div>

      {placement && (
        <div className="student-appeal-placement">
          Current placement: <strong>{placement.assigned_department || placement.department || 'Not available'}</strong>
        </div>
      )}

      {!studentId && (
        <div className="alert alert-warning" role="alert">
          Your student account could not be verified. Please sign in again before submitting an appeal.
        </div>
      )}

      <form className="student-appeal-form" onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label fw-semibold" htmlFor="appeal-subject">Subject</label>
          <input
            id="appeal-subject"
            className="form-control"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={255}
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label fw-semibold" htmlFor="appeal-message">Complaint details</label>
          <textarea
            id="appeal-message"
            className="form-control"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Explain why you disagree with your placement..."
            required
          />
        </div>
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <button type="submit" className="btn btn-primary fw-semibold px-4 py-2 rounded-3" disabled={submitting || !studentId}>
            {submitting ? 'Submitting...' : 'Submit Appeal'}
          </button>
          {feedback && (
            <div className={`alert alert-${feedback.type} py-2 px-3 small rounded-3 shadow-sm mb-0`} role={feedback.type === 'danger' ? 'alert' : 'status'}>
              {feedback.text}
            </div>
          )}
        </div>
      </form>

      <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mt-4 mb-3">
        <h3 className="h5 fw-bold text-primary mb-0">My Appeals</h3>
        <span className="small text-muted">{appeals.length} submitted</span>
      </div>
      {loading ? (
        <div className="student-notification-empty" role="status">Loading appeal history…</div>
      ) : appeals.length === 0 ? (
        <div className="student-notification-empty">
          <h3>No appeals yet</h3>
          <p>Your submitted appeals and Registrar responses will appear here.</p>
        </div>
      ) : (
        <div className="student-appeal-history">
          {appeals.map((appeal) => (
            <article className="student-appeal-record" key={appeal.id}>
              <div className="d-flex justify-content-between gap-2 flex-wrap mb-2">
                <strong>{appeal.subject}</strong>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-secondary">{appeal.status}</span>
                  {String(appeal.status).toLowerCase() === 'received' && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDelete(appeal)}
                      disabled={deletingAppealId === appeal.id}
                    >
                      {deletingAppealId === appeal.id ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
              <p className="student-appeal-message mb-2 text-muted">{appeal.message}</p>
              {appeal.response && <div className="alert alert-info mb-0"><strong>Registrar response:</strong> {appeal.response}</div>}
              <small className="text-muted">Submitted {appeal.created_at}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default StudentAppeal;
