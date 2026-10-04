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

  return (
    <div className="card p-4 border-0 shadow-sm rounded-4">
      <div className="d-flex justify-content-between align-items-start gap-3 mb-4 flex-wrap">
        <div>
          <h4 className="fw-bold text-primary mb-1">Submit Appeal</h4>
          <p className="text-muted mb-0">Send a placement complaint to the Registrar for review.</p>
        </div>
        <span className="badge bg-warning text-dark px-3 py-2">Registrar review</span>
      </div>

      {placement && (
        <div className="alert alert-light border mb-4">
          Current placement: <strong>{placement.assigned_department || 'Not available'}</strong>
        </div>
      )}

      <form onSubmit={handleSubmit}>
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
        <button type="submit" className="btn btn-primary fw-semibold" disabled={submitting || !studentId}>
          {submitting ? 'Submitting...' : 'Submit Appeal'}
        </button>
        {feedback && (
          <div className={`alert alert-${feedback.type} mt-2 py-2 px-3 small rounded-3 shadow-sm mb-0`} role={feedback.type === 'danger' ? 'alert' : 'status'}>
            {feedback.text}
          </div>
        )}
      </form>

      <hr className="my-4" />
      <h5 className="fw-bold text-primary mb-3">My Appeals</h5>
      {loading ? (
        <div className="text-muted">Loading appeal history...</div>
      ) : appeals.length === 0 ? (
        <div className="text-muted">No appeals submitted yet.</div>
      ) : (
        <div className="d-grid gap-3">
          {appeals.map((appeal) => (
            <div className="border rounded-3 p-3" key={appeal.id}>
              <div className="d-flex justify-content-between gap-2 flex-wrap mb-2">
                <strong>{appeal.subject}</strong>
                <span className="badge bg-secondary">{appeal.status}</span>
              </div>
              <p className="mb-2 text-muted">{appeal.message}</p>
              {appeal.response && <div className="alert alert-info mb-0"><strong>Registrar response:</strong> {appeal.response}</div>}
              <small className="text-muted">Submitted {appeal.created_at}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentAppeal;
