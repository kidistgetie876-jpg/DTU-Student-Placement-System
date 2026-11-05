import React, { useEffect, useState } from 'react';
import api from '../../services/api.js';

const getStoredStudent = () => {
  try {
    const storedUser = localStorage.getItem('user');
    const parsedUser = storedUser ? JSON.parse(storedUser) : {};
    return {
      ...parsedUser,
      stored_student_id: localStorage.getItem('student_id') || '',
    };
  } catch (error) {
    console.error('Unable to read the stored student account:', error);
    return null;
  }
};

const normalizeIdentifier = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || '';
};

const fetchAppeals = async (studentId, admissionNumber) => {
  const params = new URLSearchParams();
  if (studentId) params.set('student_id', studentId);
  if (admissionNumber) params.set('admission_number', admissionNumber);
  const response = await api.get(`api/student/submit_appeal.php?${params.toString()}`);
  if (!response.data?.success) {
    throw new Error(response.data?.message || 'Unable to load appeals.');
  }
  return Array.isArray(response.data.appeals) ? response.data.appeals : [];
};

const StudentAppeal = ({ studentId, placement }) => {
  const [storedStudent, setStoredStudent] = useState(getStoredStudent);
  const [subject, setSubject] = useState('Placement appeal');
  const [message, setMessage] = useState('');
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingAppealId, setDeletingAppealId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Extract ID and admission number safely from props or localStorage
  const resolvedStudentId = normalizeIdentifier(
    studentId 
    || storedStudent?.id 
    || storedStudent?.student_id 
    || storedStudent?.user_id 
    || storedStudent?.stored_student_id
  );

  const admissionNumber = normalizeIdentifier(
    storedStudent?.admission_number
    || storedStudent?.id_number
  );

  const hasStudentIdentity = Boolean(resolvedStudentId || admissionNumber);

  useEffect(() => {
    const refreshStoredStudent = () => setStoredStudent(getStoredStudent());
    window.addEventListener('storage', refreshStoredStudent);
    return () => window.removeEventListener('storage', refreshStoredStudent);
  }, []);

  const loadAppeals = async () => {
    if (!hasStudentIdentity) return;
    setLoading(true);
    try {
      setAppeals(await fetchAppeals(resolvedStudentId, admissionNumber));
    } catch (error) {
      setFeedback({ type: 'danger', text: error.response?.data?.message || error.message || 'Unable to load appeals.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasStudentIdentity) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchAppeals(resolvedStudentId, admissionNumber)
      .then(setAppeals)
      .catch((error) => {
        setFeedback({ type: 'danger', text: error.response?.data?.message || error.message || 'Unable to load appeals.' });
      })
      .finally(() => setLoading(false));
  }, [resolvedStudentId, admissionNumber, hasStudentIdentity]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!hasStudentIdentity) {
      setFeedback({ type: 'warning', text: 'Your student account could not be verified. Please sign in again before submitting an appeal.' });
      return;
    }
    if (!subject.trim() || !message.trim()) {
      setFeedback({ type: 'warning', text: 'Please enter a subject and explain your complaint.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const payload = {
        student_id: resolvedStudentId,
        ...(admissionNumber ? { admission_number: admissionNumber } : {}),
        subject: subject.trim(),
        message: message.trim(),
        placement_department: placement?.assigned_department || '',
      };
      const response = await api.post('api/student/submit_appeal.php', payload);

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
    <section className="mx-auto w-full max-w-5xl space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="student-appeal-title">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-[.18em] text-sky-700">Registrar support</span>
          <h2 id="student-appeal-title" className="mb-1 mt-1 text-2xl font-extrabold text-slate-900">Submit Appeal</h2>
          <p className="mb-0 text-sm text-slate-600">Share a placement concern with the Registrar.</p>
        </div>
        <span className="w-fit rounded-full bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">Registrar review</span>
      </div>

      {placement && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Current placement: <strong>{placement.assigned_department || placement.department || 'Not available'}</strong>
        </div>
      )}

      {!hasStudentIdentity && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
          Your student account could not be verified. Please sign in again before submitting an appeal.
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <label className="text-sm font-semibold text-slate-700" htmlFor="appeal-subject">Subject</label>
          <input
            id="appeal-subject"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={255}
            required
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-semibold text-slate-700" htmlFor="appeal-message">Complaint details</label>
          <textarea
            id="appeal-message"
            className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Explain why you disagree with your placement..."
            required
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting || !hasStudentIdentity}>
            {submitting ? 'Submitting...' : 'Submit Appeal'}
          </button>
          {feedback && (
            <div className={`rounded-lg border px-3 py-2 text-sm shadow-sm ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : feedback.type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-rose-200 bg-rose-50 text-rose-800'}`} role={feedback.type === 'danger' ? 'alert' : 'status'}>
              {feedback.text}
            </div>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <h3 className="mb-0 text-lg font-bold text-slate-900">My Appeals</h3>
        <span className="text-sm text-slate-500">{appeals.length} submitted</span>
      </div>
      {loading ? (
        <div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600" role="status">Loading appeal history…</div>
      ) : appeals.length === 0 ? (
        <div className="rounded-xl bg-slate-50 p-5">
          <h3 className="mb-1 text-base font-bold text-slate-900">No appeals yet</h3>
          <p className="mb-0 text-sm text-slate-600">Your submitted appeals and Registrar responses will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {appeals.map((appeal) => (
            <article className="rounded-xl border border-slate-200 p-4" key={appeal.id}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <strong className="text-slate-900">{appeal.subject}</strong>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{appeal.status}</span>
                  {String(appeal.status).toLowerCase() === 'received' && (
                    <button
                      type="button"
                      className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => handleDelete(appeal)}
                      disabled={deletingAppealId === appeal.id}
                    >
                      {deletingAppealId === appeal.id ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
              <p className="mb-2 whitespace-pre-wrap text-sm text-slate-700">{appeal.message}</p>
              {(appeal.responses || []).length > 0 ? (
                <section className="mb-2 space-y-2" aria-label="Appeal response history">
                  <h4 className="mb-1 text-sm font-bold text-slate-800">Registrar responses</h4>
                  {appeal.responses.map((response) => (
                    <article key={response.id} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                      <div className="mb-1 flex flex-wrap justify-between gap-2">
                        <strong>{response.sender_role === 'registrar' ? 'Registrar Response' : response.sender_name}</strong>
                        <small className="text-blue-700">{response.created_at}</small>
                      </div>
                      <p className="mb-0 whitespace-pre-wrap">{response.message}</p>
                    </article>
                  ))}
                </section>
              ) : (
                appeal.response && <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"><strong>Registrar response:</strong> {appeal.response}</div>
              )}
              <small className="text-xs text-slate-500">Submitted {appeal.created_at}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default StudentAppeal;