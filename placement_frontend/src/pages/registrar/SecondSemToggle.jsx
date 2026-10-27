import React, { useEffect, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import api from '../../services/api.js';

const SecondSemToggle = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let isCurrent = true;
    const loadPortalState = async () => {
      try {
        const response = await api.get('api/registrar/get_placement_settings.php');
        if (response.data?.success === false) {
          throw new Error(response.data?.message || 'Unable to load the choice portal state.');
        }
        const settings = response.data?.data || response.data || {};
        if (isCurrent) setIsOpen(Number(settings.is_second_sem_choice_open) === 1);
      } catch (loadError) {
        if (isCurrent) setError(loadError.response?.data?.message || loadError.message || 'Unable to load the choice portal state.');
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    loadPortalState();
    return () => {
      isCurrent = false;
    };
  }, []);

  const handleToggle = async () => {
    const nextState = !isOpen;
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const response = await api.post('api/registrar/toggle_second_sem_choice.php', { isOpen: nextState });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to update the choice portal state.');
      }
      setIsOpen(Boolean(response.data.isOpen));
      setFeedback(response.data.message || `Second-semester choice portal ${nextState ? 'opened' : 'closed'}.`);
    } catch (toggleError) {
      setError(toggleError.response?.data?.message || toggleError.message || 'Unable to update the choice portal state.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-100 bg-indigo-50 p-5 dark:border-slate-700 dark:bg-slate-800"
      aria-labelledby="second-sem-choice-heading"
    >
      <div>
        <h5 id="second-sem-choice-heading" className="mb-1 text-lg font-semibold text-indigo-950 dark:text-slate-100">
          2nd Semester Department Choice Portal
        </h5>
        <div className="flex flex-wrap items-center gap-2">
          <p className="mb-0 text-sm text-slate-600 dark:text-slate-300">
            Student preferences are {isOpen ? 'open' : 'closed'} for pending second-semester placements.
          </p>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              isOpen
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
            }`}
          >
            Portal Status: {isOpen ? 'OPEN' : 'LOCKED'}
          </span>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isOpen}
        aria-label="Second-semester department choice portal"
        onClick={handleToggle}
        disabled={loading || saving}
        className={`inline-flex min-w-32 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          isOpen
            ? 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500'
            : 'bg-slate-600 hover:bg-slate-700 focus:ring-slate-500'
        }`}
      >
        {loading || saving
          ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
          : isOpen
            ? <Check size={16} aria-hidden="true" />
            : <X size={16} aria-hidden="true" />}
        {loading ? 'Loading...' : saving ? 'Saving...' : isOpen ? 'Open' : 'Closed'}
      </button>
      {feedback && <div className="w-full text-sm text-emerald-700 dark:text-emerald-300" role="status">{feedback}</div>}
      {error && <div className="w-full text-sm text-red-700 dark:text-red-300" role="alert">{error}</div>}
    </section>
  );
};

export default SecondSemToggle;
