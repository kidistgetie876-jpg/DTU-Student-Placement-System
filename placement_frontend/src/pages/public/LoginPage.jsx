import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import api from '../../services/api.js';
import dtuLogo from '../../assets/image.png';
import './LoginPage.css';

const isHtmlResponse = (data) =>
  typeof data === 'string' && /<(?:!doctype\s+html|html)\b/i.test(data);
const isEmailIdentifier = (value) => value.trim().includes('@');
const LOGIN_TIMEOUT_MS = 15000;

const clearStoredAuthentication = () => {
  ['user', 'role', 'admission_number', 'token', 'accessToken', 'authToken'].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

const LoginPage = () => {
  const [identifier, setIdentifier] = useState('');
  const [credential, setCredential] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState('request');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const authMessage = sessionStorage.getItem('authMessage');
    if (authMessage) {
      setError(authMessage);
      sessionStorage.removeItem('authMessage');
    }
  }, []);

  useEffect(() => {
    if (!isResetOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !resetLoading) setIsResetOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isResetOpen, resetLoading]);

  const openResetDialog = () => {
    setResetEmail(isEmailIdentifier(identifier) ? identifier.trim() : '');
    setResetCode('');
    setResetPassword('');
    setResetPasswordConfirmation('');
    setResetStep('request');
    setResetError('');
    setResetMessage('');
    setIsResetOpen(true);
  };

  const closeResetDialog = () => {
    if (resetLoading) return;
    setIsResetOpen(false);
  };

  const handleResetRequest = async (event) => {
    event.preventDefault();
    const email = resetEmail.trim();
    if (!email) {
      setResetError('Enter the email address registered to your account.');
      return;
    }

    setResetLoading(true);
    setResetError('');
    setResetMessage('');
    try {
      const response = await api.post('http://127.0.0.1:8888/student-placement/placement_backend/auth/forgot_password.php', { email });
      console.log('Forgot password response:', response?.data);

      const isSuccess = response.data?.success === true || response.data?.status === 'success';
      if (!isSuccess) {
        setResetError(response.data?.message || 'Unable to send the password reset request.');
        return;
      }
      setResetStep('verify');
      setResetMessage(response.data?.message || 'Reset link sent');
    } catch (requestError) {
      const serverMessage = requestError.response?.data?.message || requestError.response?.data?.error || requestError.message;
      console.error('Forgot password request failed:', {
        status: requestError.response?.status,
        code: requestError.code,
        message: serverMessage,
        response: requestError.response?.data,
      });
      setResetError(serverMessage || 'Unable to send the reset request right now. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setResetError('Enter the six-digit verification code from your email.');
      return;
    }
    if (resetPassword.length < 6) {
      setResetError('Your new password must be at least 6 characters long.');
      return;
    }
    if (resetPassword !== resetPasswordConfirmation) {
      setResetError('The passwords do not match.');
      return;
    }

    setResetLoading(true);
    setResetError('');
    setResetMessage('');
    try {
      const response = await api.post('auth/reset_password.php', {
        email: resetEmail.trim(),
        code: resetCode.trim(),
        new_password: resetPassword,
      });
      if (!response.data?.success) {
        setResetError(response.data?.message || 'Unable to reset the password.');
        return;
      }
      setResetStep('complete');
      setResetMessage(response.data.message || 'Your password has been reset. You can now sign in.');
    } catch (requestError) {
      setResetError(requestError.response?.data?.message || 'Unable to reset the password right now. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');

    if (!identifier.trim() || !credential.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    clearStoredAuthentication();
    setLoading(true);
    try {
      const payload = isEmailIdentifier(identifier)
        ? { email: identifier.trim(), password: credential.trim() }
        : { admission_number: identifier.trim(), given_name: credential.trim() };

      const response = await api.post('auth/login.php', payload, {
        timeout: LOGIN_TIMEOUT_MS,
      });

      const data = response.data;
      if (isHtmlResponse(data)) {
        setError('The login service returned a web page instead of JSON. Check the backend URL and redeploy the API.');
        return;
      }
      if (!data || typeof data !== 'object') {
        setError('The login service returned an invalid response. Please try again later.');
        return;
      }

      if (data.status === 'success' || data.success) {
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('role', data.user.role);
          if (data.user.id_number) {
            localStorage.setItem('admission_number', data.user.id_number);
          }
        }

        const role = data.user?.role?.toLowerCase();
        if (role === 'student') {
          navigate('/student-dashboard');
        } else if (role === 'registrar') {
          navigate('/registrar-dashboard');
        } else if (role === 'admin') {
          navigate('/admin-dashboard');
        } else if (['head', 'department_head', 'department head', 'head of department', 'hod', 'coordinator'].includes(role)) {
          navigate('/head-dashboard');
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(data.message || 'Login failed.');
      }
    } catch (err) {
      const responseData = err.response?.data;
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        setError('The login request timed out. Please try again.');
      } else if (isHtmlResponse(responseData)) {
        setError('The login service returned a web page instead of JSON. Check the backend URL and redeploy the API.');
      } else if (typeof responseData === 'string') {
        setError('The login service returned an invalid response. Please try again later.');
      } else {
        setError(responseData?.message || 'Invalid credentials or connection issue.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="login-page relative isolate flex w-full items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50/30 to-slate-100 px-4 py-4 sm:px-6 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-16 h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(129,140,248,0.10),transparent_45%)]" />

      <div className="relative z-10 mx-auto w-full max-w-md">
        <div className="login-card w-full animate-login-enter rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xl shadow-slate-900/15 motion-reduce:animate-none sm:px-5 sm:py-3">
          <div className="mb-1.5 text-center">
            <img
              src={dtuLogo}
              alt="Debre Tabor University logo"
              className="login-logo mx-auto mb-1 rounded-2xl border border-amber-300/70 bg-white p-1 shadow-lg shadow-indigo-950/10"
            />
            <p className="mb-0.5 text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">
              Debre Tabor University
            </p>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              SDPS
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Sign in to continue to your placement portal</p>
          </div>

          {error && (
            <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-5 text-rose-700" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-1.5">
            <div>
              <label htmlFor="login-identifier" className="mb-0.5 block text-sm font-semibold text-slate-700">
                Admission ID / Email
              </label>
              <input
                id="login-identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                placeholder="Enter admission ID or email"
                className="login-form-input block w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="login-credential" className="mb-0.5 block text-sm font-semibold text-slate-700">
                First Name / Password
              </label>
              <input
                id="login-credential"
                name="credential"
                type={isEmailIdentifier(identifier) ? 'password' : 'text'}
                autoComplete={isEmailIdentifier(identifier) ? 'current-password' : 'given-name'}
                placeholder="Enter first name or password"
                className="login-form-input block w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                required
              />
            </div>

            <div className="login-forgot-link">
              <button
                type="button"
                onClick={openResetDialog}
                className="cursor-pointer text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              className="login-sign-in-button group flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              disabled={loading}
            >
              <span className="text-white">{loading ? 'Signing in…' : 'Sign In'}</span>
              {!loading && <ArrowRight aria-hidden="true" size={18} className="text-white transition-transform duration-200 group-hover:translate-x-1" />}
            </button>
          </form>

          <p className="mt-1.5 text-center text-xs leading-4 text-slate-500">
            Authorized access only · Debre Tabor University
          </p>
        </div>
      </div>

      {isResetOpen && createPortal(
        <div
          className="login-reset-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeResetDialog();
          }}
        >
          <section
            className="login-reset-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-dialog-title"
          >
            <button
              type="button"
              className="login-reset-close"
              aria-label="Close password reset"
              onClick={closeResetDialog}
              disabled={resetLoading}
            >
              <X aria-hidden="true" size={18} />
            </button>

            <h2 id="reset-dialog-title" className="login-reset-title">
              {resetStep === 'complete' ? 'Password updated' : 'Reset your password'}
            </h2>
            <p className="login-reset-description">
              {resetStep === 'request'
                ? 'Enter the email address registered to your account. We’ll send a verification code if the account is eligible.'
                : resetStep === 'verify'
                  ? `Enter the verification code sent to ${resetEmail.trim()} and choose a new password.`
                  : 'Your password has been updated. You can now sign in with your new password.'}
            </p>

            {resetError && (
              <div className="login-reset-notice login-reset-error" role="alert">
                {resetError}
              </div>
            )}
            {resetMessage && (
              <div className="login-reset-notice login-reset-success" role="status">
                {resetMessage}
              </div>
            )}

            {resetStep === 'request' && (
              <form className="login-reset-form" onSubmit={handleResetRequest}>
                <div>
                  <label htmlFor="reset-email" className="login-reset-label">
                    Registered email address
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your email"
                    className="login-reset-input"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="login-reset-submit"
                  disabled={resetLoading}
                >
                  {resetLoading ? 'Sending request…' : 'Send Reset Request'}
                </button>
              </form>
            )}

            {resetStep === 'verify' && (
              <form className="login-reset-form" onSubmit={handlePasswordReset}>
                <div>
                  <label htmlFor="reset-code" className="login-reset-label">
                    Six-digit verification code
                  </label>
                  <input
                    id="reset-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    className="login-reset-input"
                    value={resetCode}
                    onChange={(event) => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="reset-new-password" className="login-reset-label">
                    New password
                  </label>
                  <input
                    id="reset-new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    className="login-reset-input"
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="reset-confirm-password" className="login-reset-label">
                    Confirm new password
                  </label>
                  <input
                    id="reset-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    className="login-reset-input"
                    value={resetPasswordConfirmation}
                    onChange={(event) => setResetPasswordConfirmation(event.target.value)}
                    required
                  />
                </div>
                <div className="login-reset-actions">
                  <button
                    type="button"
                    className="login-reset-secondary"
                    onClick={() => {
                      setResetStep('request');
                      setResetError('');
                      setResetMessage('');
                    }}
                    disabled={resetLoading}
                  >
                    Change email
                  </button>
                  <button
                    type="submit"
                    className="login-reset-submit"
                    disabled={resetLoading}
                  >
                    {resetLoading ? 'Resetting…' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}

            {resetStep === 'complete' && (
              <button
                type="button"
                className="login-reset-submit"
                onClick={closeResetDialog}
              >
                Back to Sign In
              </button>
            )}
          </section>
        </div>,
        document.body
      )}
    </section>
  );
};

export default LoginPage;
