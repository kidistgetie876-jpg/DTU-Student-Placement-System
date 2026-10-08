import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../services/api.js';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.post('auth/reset_password.php', { token, newPassword: password });
      setSuccess(response.data.message || 'Your password has been reset.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to reset your password. Please request a new link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-sm-10 col-md-7 col-lg-5">
          <div className="card border-0 shadow-lg" style={{ borderRadius: '20px', overflow: 'hidden' }}>
            <div className="px-4 py-3 text-white" style={{ backgroundColor: '#0a2d6d' }}>
              <h1 className="h5 fw-bold mb-0">Choose a New Password</h1>
            </div>
            <div className="card-body p-4">
              {success ? (
                <>
                  <div className="alert alert-success small rounded-3" role="status">{success}</div>
                  <Link className="btn btn-primary fw-bold" style={{ backgroundColor: '#0a2d6d' }} to="/login">Return to Login</Link>
                </>
              ) : !token ? (
                <>
                  <div className="alert alert-danger small rounded-3" role="alert">This password reset link is invalid or has expired.</div>
                  <Link className="btn btn-primary fw-bold" style={{ backgroundColor: '#0a2d6d' }} to="/login">Return to Login</Link>
                </>
              ) : (
                <form onSubmit={handleSubmit}>
                  {error && <div className="alert alert-danger small rounded-3" role="alert">{error}</div>}
                  <p className="small text-muted">Enter a new password for your account. Passwords must be at least 6 characters.</p>
                  <div className="mb-3">
                    <label htmlFor="new-password" className="form-label small fw-bold text-secondary">New Password</label>
                    <input
                      id="new-password"
                      className="form-control py-2 rounded-3"
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                  <div className="mb-4">
                    <label htmlFor="confirm-password" className="form-label small fw-bold text-secondary">Confirm New Password</label>
                    <input
                      id="confirm-password"
                      className="form-control py-2 rounded-3"
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      required
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary w-100 fw-bold py-2" style={{ backgroundColor: '#0a2d6d' }} disabled={loading}>
                    {loading ? 'Updating Password...' : 'Reset Password'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
