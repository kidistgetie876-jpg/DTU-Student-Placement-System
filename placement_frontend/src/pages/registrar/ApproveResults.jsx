import { useEffect, useState } from 'react';
import api from '../../services/api';

const DEFAULT_API_BASE = `${api.defaults.baseURL}api/registrar`;

export default function ApproveResults({ apiBase = DEFAULT_API_BASE, onPublished }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadPendingResults = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiBase}/get_pending_results.php`);
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
  };

  useEffect(() => {
    loadPendingResults();
  }, [apiBase]);

  const publishAllResults = async () => {
    setPublishing(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`${apiBase}/publish_all_results.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  if (loading) return <p>Loading pending results...</p>;

  return (
    <section aria-labelledby="approve-results-heading">
      <div>
        <h2 id="approve-results-heading">Approve &amp; Publish</h2>
        <button type="button" onClick={publishAllResults} disabled={publishing || results.length === 0}>
          {publishing ? 'Publishing...' : `Approve ${results.length} result${results.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}

      {results.length === 0 ? (
        <p>No pending placement results.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Department</th>
              <th>Final Score</th>
              <th>Choice Rank</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={`${result.student_id}-${result.dept_name}`}>
                <td>{result.student_id}</td>
                <td>{result.dept_name}</td>
                <td>{result.final_score}</td>
                <td>{result.choice_rank}</td>
                <td>{result.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
