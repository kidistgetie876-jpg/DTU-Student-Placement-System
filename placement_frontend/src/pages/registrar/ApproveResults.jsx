import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, LoaderCircle, RefreshCw } from 'lucide-react';
import api from '../../services/api';

const DEFAULT_API_BASE = `${api.defaults.baseURL}api/registrar`;
const REQUEST_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) {
      throw new Error('The server took too long to respond. Please try again.');
    }
    throw new Error('Unable to reach the local server. Check that MAMP is running.');
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export default function ApproveResults({ apiBase = DEFAULT_API_BASE, onPublished }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadPendingResults = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetchWithTimeout(`${apiBase}/get_pending_results.php`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to load pending results');
      }
      setResults(data.results || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadPendingResults();
  }, [loadPendingResults]);

  const publishAllResults = async () => {
    setPublishing(true);
    setMessage('');
    setError('');

    try {
      const response = await fetchWithTimeout(`${apiBase}/publish_all_results.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to publish results');
      }
      setMessage(data.message);
      setResults([]);
      onPublished?.(data.updated);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section className="approve-results-page" aria-labelledby="approve-results-heading">
      <div className="approve-results-card">
        <header className="approve-results-header">
          <div className="approve-results-title">
            <span className="approve-results-icon" aria-hidden="true">
              <ClipboardCheck size={22} />
            </span>
            <div>
              <h2 id="approve-results-heading">Approve &amp; Publish</h2>
              <p>Review assigned placements before sharing results. Students without a department remain under Unassigned.</p>
            </div>
          </div>
          <div className="approve-results-actions">
            <button
              className="approve-results-secondary"
              type="button"
              onClick={loadPendingResults}
              disabled={loading || publishing}
            >
              <RefreshCw size={16} className={loading ? 'approve-results-spinning' : ''} aria-hidden="true" />
              Refresh
            </button>
            <button
              className="approve-results-primary"
              type="button"
              onClick={publishAllResults}
              disabled={publishing || loading || results.length === 0}
            >
              {publishing ? (
                <LoaderCircle size={17} className="approve-results-spinning" aria-hidden="true" />
              ) : (
                <CheckCircle2 size={17} aria-hidden="true" />
              )}
              {publishing ? 'Publishing...' : `Approve ${results.length} result${results.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </header>

        <div className="approve-results-content">
          {message && <p className="approve-results-notice success" role="status">{message}</p>}
          {error && <p className="approve-results-notice error" role="alert">{error}</p>}

          {loading ? (
            <div className="approve-results-empty" role="status">
              <LoaderCircle size={22} className="approve-results-spinning" aria-hidden="true" />
              <span>Loading pending results...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="approve-results-empty">
              <span className="approve-results-empty-icon" aria-hidden="true">
                <CheckCircle2 size={22} />
              </span>
              <div>
                <strong>Everything is up to date</strong>
                <p>No pending placement results to review.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="approve-results-summary">
                <span className="approve-results-count">{results.length}</span>
                <span>result{results.length === 1 ? '' : 's'} awaiting approval</span>
              </div>
              <div className="approve-results-table-wrap">
                <table className="approve-results-table">
                  <thead>
                    <tr>
                      <th scope="col">Student ID</th>
                      <th scope="col">Department</th>
                      <th scope="col">Final Score</th>
                      <th scope="col">Choice Rank</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => (
                      <tr key={`${result.student_id}-${result.dept_name}`}>
                        <td className="approve-results-student-id">{result.student_id}</td>
                        <td>{result.dept_name}</td>
                        <td>{result.final_score}</td>
                        <td><span className="badge-choice">Choice {result.choice_rank}</span></td>
                        <td>
                          <span className={`badge ${String(result.status).toLowerCase() === 'pending' ? 'badge-pending' : 'badge-placed'}`}>
                            {result.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
