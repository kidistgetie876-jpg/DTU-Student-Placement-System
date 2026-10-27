import React, { useState } from 'react';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import api from '../../services/api.js';

const ResetStudentChoices = ({ activeSemester }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const handleReset = async () => {
    if (saving) return;
    const confirmed = window.confirm(
      `Reset all saved student choices for the currently active Semester ${activeSemester}? Choices for the other semester, student records, accounts, placements, and department capacities will not be changed.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const response = await api.post(
        'api/registrar/reset_active_student_choices.php',
        { confirmed: true, expectedSemester: Number(activeSemester) },
        { withCredentials: true },
      );
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to reset student choices.');
      }
      setFeedback(response.data.message || `Student choices for Semester ${response.data.semester} were reset.`);
    } catch (resetError) {
      setError(resetError.response?.data?.message || resetError.message || 'Unable to reset student choices.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-slate-800"
      aria-labelledby="reset-student-choices-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h5 id="reset-student-choices-heading" className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Reset Student Choices
          </h5>
          <p className="mb-0 max-w-3xl text-sm text-slate-700 dark:text-slate-300">
            Remove saved choices for the active semester only (Semester {activeSemester}). Student choice submission status will clear with those records. Student profiles, accounts, placement results, other-semester choices, and department capacities are not changed.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-700 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-600 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-700"
        >
          {saving
            ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
            : <RotateCcw size={16} aria-hidden="true" />}
          {saving ? 'Resetting choices...' : `Reset Semester ${activeSemester} Choices`}
        </button>
      </div>
      {feedback && <p className="mb-0 mt-3 text-sm text-emerald-700 dark:text-emerald-300" role="status">{feedback}</p>}
      {error && <p className="mb-0 mt-3 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
    </section>
  );
};

export default ResetStudentChoices;
