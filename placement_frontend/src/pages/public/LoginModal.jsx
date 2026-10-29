import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api.js';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { FiLock, FiUser } from 'react-icons/fi';
import dtuLogo from '../../assets/image.png';
import PasswordInput from '../../components/layout/PasswordInput.jsx';
import './LoginModal.css';

const noop = () => {};

const LoginModal = ({ isOpen = true, onClose = noop, standalone = false, redirectTo = '' }) => {
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimer = useRef(null);
  const previousFocus = useRef(null);
  const identifierInput = useRef(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [resetData, setResetData] = useState({ email: '', code: '', newPassword: '', confirmPassword: '' });
  const [resetStep, setResetStep] = useState('request');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      window.clearTimeout(closeTimer.current);
      previousFocus.current = document.activeElement;
      setIsRendered(true);
      setIsClosing(false);
      if (isRendered) identifierInput.current?.focus();
    } else if (isRendered) {
      setIsClosing(true);
      closeTimer.current = window.setTimeout(() => {
        setIsRendered(false);
        setIsClosing(false);
        previousFocus.current?.focus?.();
      }, 220);
    }

    return () => window.clearTimeout(closeTimer.current);
  }, [isOpen, isRendered]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const normalizeRole = (value) => String(value ?? '').trim().toLowerCase();
  const isValidEmail = (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

  const getLoginError = (responseOrError) => {
    const responseData = responseOrError?.data || responseOrError?.response?.data || {};
    const message = responseData.message || responseData.error || '';
    const normalizedMessage = String(message).toLowerCase();
    const responseCode = String(responseData.code || '').toUpperCase();

    if (responseCode === 'INVALID_PASSWORD' || normalizedMessage.includes('password') || normalizedMessage.includes('email or password')) {
      return 'Please enter the correct password.';
    }
    if (responseCode === 'INVALID_EMAIL' || normalizedMessage.includes('email not found') || normalizedMessage.includes('invalid email')) {
      return 'Please enter the correct email or username.';
    }
    if (responseCode === 'INVALID_IDENTIFIER' || responseCode === 'USER_NOT_FOUND') {
      return 'Please enter the correct email or username.';
    }
    if (normalizedMessage.includes('email') || normalizedMessage.includes('username') || normalizedMessage.includes('identifier')) {
      return 'Please enter the correct email or username.';
    }
    return message || 'Unable to log in. Please check your credentials and password.';
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const trimmedIdentifier = identifier.trim();
    if (trimmedIdentifier.includes('@') && !isValidEmail(trimmedIdentifier)) {
      setError('Please enter a valid email.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.post('auth/login.php', { username_or_email: trimmedIdentifier, password });
      if (response.data.status === 'success' || response.data.success === true) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
        const role = normalizeRole(response.data.user.role);
        const dashboardMap = {
          admin: { path: '/admin-dashboard', tab: 'dashboard' },
          registrar: { path: '/registrar-dashboard/overview', tab: 'overview' },
          student: { path: '/student-dashboard', tab: 'overview' },
          head: { path: '/head-dashboard', tab: 'overview' },
          hod: { path: '/head-dashboard', tab: 'overview' },
          coordinator: { path: '/head-dashboard', tab: 'overview' },
          'head of department': { path: '/head-dashboard', tab: 'overview' },
        };
        const destination = dashboardMap[role];
        const studentServiceRedirect = role === 'student'
          && (
            redirectTo === '/placement-info'
            || /^\/student-dashboard\?tab=(overview|preferences|result|appeal)$/.test(redirectTo)
          );
        const serviceTab = studentServiceRedirect
          ? new URLSearchParams(redirectTo.split('?')[1] || '').get('tab')
          : null;
        if (destination) localStorage.setItem('activeTab', serviceTab || destination.tab);
        onClose({ authenticated: true });
        navigate(studentServiceRedirect ? redirectTo : destination?.path || '/', { replace: true });
      } else {
        setError(getLoginError(response));
      }
    } catch (err) {
      setError(getLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    const email = resetData.email.trim();
    if (!isValidEmail(email)) {
      setResetError('Please enter a valid email address.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    setResetMessage('');
    try {
      const response = await api.post('auth/forgot_password.php', { email });
      setResetStep('reset');
      setResetMessage(response.data?.message || 'If an account uses that email and email delivery is available, a verification code will arrive shortly.');
    } catch (err) {
      setResetError(err.response?.data?.message || 'Unable to process the request right now. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(resetData.code.trim())) {
      setResetError('Enter the six-digit verification code from your email.');
      return;
    }
    if (resetData.newPassword.length < 6) {
      setResetError('Password must be at least 6 characters long.');
      return;
    }
    if (resetData.newPassword !== resetData.confirmPassword) {
      setResetError('New passwords do not match.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    setResetMessage('');
    try {
      const response = await api.post('auth/reset_password.php', {
        email: resetData.email.trim(),
        code: resetData.code.trim(),
        newPassword: resetData.newPassword,
      });
      if (!response.data?.success) throw new Error(response.data?.message || 'Unable to reset the password.');
      setResetStep('complete');
      setResetMessage(response.data.message || 'Your password has been reset. You can now sign in.');
    } catch (err) { 
      setResetError(err.response?.data?.message || err.message || 'Unable to reset the password right now.');
    } finally {
      setResetLoading(false);
    }
  };

  const closeResetModal = () => {
    setShowModal(false);
    setResetData({ email: '', code: '', newPassword: '', confirmPassword: '' });
    setResetStep('request');
    setResetError('');
    setResetMessage('');
  };

  const closeLoginModal = () => {
    closeResetModal();
    onClose();
  };

  const openResetModal = () => {
    setResetData((current) => ({
      ...current,
      email: isValidEmail(identifier.trim()) ? identifier.trim() : '',
    }));
    setResetStep('request');
    setResetError('');
    setResetMessage('');
    setShowModal(true);
  };

  const openResetTab = () => {
    setResetData((current) => ({
      ...current,
      email: isValidEmail(identifier.trim()) ? identifier.trim() : current.email,
    }));
    setResetStep('request');
    setResetError('');
    setResetMessage('');
    setActiveTab('reset');
  };

  if (!isRendered) return null;

  const loginContent = (
    <div
      className={`login-modal-backdrop${standalone ? ' login-page-backdrop' : ''}${isClosing ? ' is-closing' : ''}`}
      onMouseDown={(event) => {
        if (!standalone && event.target === event.currentTarget) closeLoginModal();
      }}
    >
      <section
        className={`login-modal-dialog${standalone ? ' login-page-dialog' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        aria-describedby="login-modal-description"
      >
        {!standalone && (
          <button type="button" className="login-modal-close" aria-label="Close dialog" onClick={closeLoginModal}>
            <span aria-hidden="true">&times;</span>
          </button>
        )}
        <div className="container-fluid px-0">
        <div className="row justify-content-center">
          <div className="col-12">
            
            {/* Modern Card */}
            <div 
              className={`card login-modal-card border-0 shadow-lg${standalone ? ' login-page-card' : ''}`}
              style={{ 
                borderRadius: '24px', 
                overflow: 'hidden',
                boxShadow: '0 20px 45px rgba(10, 45, 109, 0.12)',
                backgroundColor: '#ffffff'
              }}
            >
              {/* Card Top Header Accent Bar */}
              <div style={{ height: '6px', background: 'linear-gradient(90deg, #0a2d6d 0%, #f4c95d 100%)' }}></div>
              
              <div className="card-body p-4 p-sm-5">
                {standalone && (
                  <div className="login-page-tabs" role="tablist" aria-label="Login and password reset">
                    <button
                      type="button"
                      id="login-tab"
                      role="tab"
                      aria-selected={activeTab === 'login'}
                      aria-controls="login-tab-panel"
                      className={activeTab === 'login' ? 'active' : ''}
                      onClick={() => setActiveTab('login')}
                    >
                      Log in
                    </button>
                    <button
                      type="button"
                      id="reset-tab"
                      role="tab"
                      aria-selected={activeTab === 'reset'}
                      aria-controls="reset-tab-panel"
                      className={activeTab === 'reset' ? 'active' : ''}
                      onClick={openResetTab}
                    >
                      Reset your password
                    </button>
                  </div>
                )}

                {/* Brand Logo & Title */}
                <div className="text-center mb-4">
                  <img 
                    src={dtuLogo} 
                    alt="DTU Logo" 
                    style={{ width: 68, height: 68, borderRadius: '16px', padding: '4px', border: '2px solid #f4c95d', marginBottom: '12px' }} 
                  />
                  <h3 id="login-modal-title" className="fw-bold mb-1" style={{ color: '#0a2d6d', letterSpacing: '-0.02em' }}>{standalone ? 'User Login' : 'Portal Login'}</h3>
                  <p id="login-modal-description" className="text-muted small mb-0">Sign in to access your DTU placement portal</p>
                </div>

                {activeTab === 'login' ? (
                  <div id="login-tab-panel" role={standalone ? 'tabpanel' : undefined} aria-labelledby={standalone ? 'login-tab' : undefined}>
                    {error && (
                      <div className="alert alert-danger py-2 px-3 small text-center rounded-3 mb-3 border-0 shadow-sm" role="alert" style={{ backgroundColor: '#ffebe8', color: '#c92a2a' }}>
                        {error}
                      </div>
                    )}

                    <form onSubmit={handleLogin} autoComplete="on">
                  {/* Identifier Input */}
                  <div className="mb-3">
                    <label htmlFor="login-identifier" className="form-label small fw-bold text-secondary mb-1">
                      Username or Email
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0 text-muted" style={{ borderRadius: '12px 0 0 12px' }}>
                        <FiUser />
                      </span>
                      <input 
                        ref={identifierInput}
                        id="login-identifier" 
                        name="username_or_email"
                        type="text" 
                        autoComplete="username"
                        data-lpignore="true" 
                        data-1p-ignore="true" 
                        placeholder="Enter your username or email"
                        className="form-control border-start-0 bg-light py-2"
                        style={{ borderRadius: '0 12px 12px 0', fontSize: '0.95rem' }}
                        value={identifier} 
                        onChange={(e) => setIdentifier(e.target.value)} 
                        required 
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="mb-4">
                    <label htmlFor="login-password" className="form-label small fw-bold text-secondary mb-1">
                      Password
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-end-0 text-muted" style={{ borderRadius: '12px 0 0 12px' }}>
                        <FiLock />
                      </span>
                      <input 
                        id="login-password" 
                        name="password"
                        type={showPassword ? 'text' : 'password'} 
                        autoComplete="current-password"
                        data-lpignore="true" 
                        data-1p-ignore="true" 
                        placeholder="Enter your password" 
                        className="form-control border-start-0 border-end-0 bg-light py-2" 
                        style={{ fontSize: '0.95rem' }}
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                      />
                      <button 
                        type="button" 
                        className="btn btn-light border border-start-0 text-muted" 
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        title={showPassword ? 'Hide password' : 'Show password'}
                        style={{ borderRadius: '0 12px 12px 0' }}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>

                  <div className="login-forgot-link">
                    <button
                      type="button"
                      onClick={standalone ? openResetTab : openResetModal}
                      className="btn btn-link btn-sm text-decoration-none fw-semibold"
                      style={{ color: '#0a2d6d' }}
                    >
                      Forgot password?
                    </button>
                  </div>

                  {/* Submit Button */}
                  <button 
                    type="submit" 
                    className="btn w-100 fw-bold py-2 shadow-sm text-white" 
                    style={{ 
                      backgroundColor: '#0a2d6d', 
                      borderRadius: '12px', 
                      letterSpacing: '0.04em',
                      transition: 'all 0.3s ease'
                    }}
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    ) : null}
                    {loading ? 'SIGNING IN...' : 'LOGIN'}
                  </button>
                    </form>
                  </div>
                ) : (
                  <div id="reset-tab-panel" role="tabpanel" aria-labelledby="reset-tab">
                    {resetError && <div className="alert alert-danger py-2 px-3 small" role="alert">{resetError}</div>}
                    {resetMessage && <div className="alert alert-info py-2 px-3 small" role="status">{resetMessage}</div>}
                    {resetStep === 'request' && (
                      <form onSubmit={handleForgotPassword}>
                        <div className="mb-3">
                          <label htmlFor="reset-email" className="form-label small fw-bold text-secondary">Email address</label>
                          <input
                            id="reset-email"
                            type="email"
                            className="form-control bg-light py-2"
                            autoComplete="email"
                            value={resetData.email}
                            onChange={(event) => setResetData((current) => ({ ...current, email: event.target.value }))}
                            required
                          />
                        </div>
                        <button type="submit" className="btn w-100 fw-bold py-2 text-white" style={{ backgroundColor: '#0a2d6d', borderRadius: '12px' }} disabled={resetLoading}>
                          {resetLoading ? 'Sending code…' : 'Send reset code'}
                        </button>
                      </form>
                    )}
                    {resetStep === 'reset' && (
                      <form onSubmit={handleResetSubmit}>
                        <div className="mb-3">
                          <label htmlFor="reset-code" className="form-label small fw-bold text-secondary">Six-digit verification code</label>
                          <input
                            id="reset-code"
                            className="form-control bg-light py-2"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={resetData.code}
                            onChange={(event) => setResetData((current) => ({ ...current, code: event.target.value }))}
                            required
                          />
                        </div>
                        <div className="mb-3">
                          <label htmlFor="reset-new-password" className="form-label small fw-bold text-secondary">New password</label>
                          <PasswordInput
                            id="reset-new-password"
                            inputClassName="form-control bg-light py-2"
                            autoComplete="new-password"
                            label="new password"
                            value={resetData.newPassword}
                            onChange={(event) => setResetData((current) => ({ ...current, newPassword: event.target.value }))}
                            required
                          />
                        </div>
                        <div className="mb-3">
                          <label htmlFor="reset-confirm-password" className="form-label small fw-bold text-secondary">Confirm new password</label>
                          <PasswordInput
                            id="reset-confirm-password"
                            inputClassName="form-control bg-light py-2"
                            autoComplete="new-password"
                            label="confirm password"
                            value={resetData.confirmPassword}
                            onChange={(event) => setResetData((current) => ({ ...current, confirmPassword: event.target.value }))}
                            required
                          />
                        </div>
                        <button type="submit" className="btn w-100 fw-bold py-2 text-white" style={{ backgroundColor: '#0a2d6d', borderRadius: '12px' }} disabled={resetLoading}>
                          {resetLoading ? 'Resetting password…' : 'Reset password'}
                        </button>
                      </form>
                    )}
                    {resetStep === 'complete' && (
                      <button type="button" className="btn btn-link fw-semibold" onClick={() => setActiveTab('login')}>
                        Return to log in
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* --- FORGOT PASSWORD MODAL --- */}
      {showModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(10, 45, 109, 0.45)', backdropFilter: 'blur(4px)', zIndex: 2010 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '20px', overflow: 'hidden' }}>
              <div className="modal-header text-white px-4 py-3" style={{ backgroundColor: '#0a2d6d' }}>
                <h5 className="modal-title fw-bold">
                  {resetStep === 'request' ? 'Forgot Password' : resetStep === 'reset' ? 'Reset Your Password' : 'Password Updated'}
                </h5>
                <button type="button" className="btn-close btn-close-white" aria-label="Close" onClick={closeResetModal}></button>
              </div>
              {resetStep === 'request' ? (
                <form onSubmit={handleForgotPassword}>
                  <div className="modal-body p-4">
                    <p className="text-muted small">Enter the email address on your account. If it is registered, we’ll send a six-digit reset code.</p>
                    {resetError && <div className="alert alert-danger small rounded-3">{resetError}</div>}
                    <div className="mb-3">
                      <label htmlFor="reset-email" className="small fw-bold text-secondary">Email Address</label>
                      <input
                        id="reset-email"
                        type="email"
                        className="form-control py-2 rounded-3"
                        placeholder="Enter your email"
                        autoComplete="email"
                        value={resetData.email}
                        onChange={(e) => setResetData((current) => ({ ...current, email: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="modal-footer border-0 px-4 pb-4 pt-0">
                    <button type="button" className="btn btn-light px-3 py-2 rounded-3" onClick={closeResetModal}>Cancel</button>
                    <button type="submit" className="btn btn-primary px-4 py-2 rounded-3 fw-bold" style={{ backgroundColor: '#0a2d6d' }} disabled={resetLoading}>
                      {resetLoading ? 'Sending...' : 'Send reset code'}
                    </button>
                  </div>
                </form>
              ) : resetStep === 'reset' ? (
                <form onSubmit={handleResetSubmit}>
                  <div className="modal-body p-4">
                    {resetMessage && <div className="alert alert-info small rounded-3">{resetMessage}</div>}
                    {resetError && <div className="alert alert-danger small rounded-3">{resetError}</div>}
                    <div className="mb-3">
                      <label htmlFor="reset-code" className="small fw-bold text-secondary">Six-digit verification code</label>
                      <input
                        id="reset-code"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        className="form-control py-2 rounded-3"
                        autoComplete="one-time-code"
                        value={resetData.code}
                        onChange={(e) => setResetData((current) => ({ ...current, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label htmlFor="reset-new-password" className="small fw-bold text-secondary">New Password</label>
                      <PasswordInput
                        id="reset-new-password"
                        minLength={6}
                        inputClassName="form-control py-2 rounded-3"
                        autoComplete="new-password"
                        label="new password"
                        value={resetData.newPassword}
                        onChange={(e) => setResetData((current) => ({ ...current, newPassword: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label htmlFor="reset-confirm-password" className="small fw-bold text-secondary">Confirm New Password</label>
                      <PasswordInput
                        id="reset-confirm-password"
                        minLength={6}
                        inputClassName="form-control py-2 rounded-3"
                        autoComplete="new-password"
                        label="confirm password"
                        value={resetData.confirmPassword}
                        onChange={(e) => setResetData((current) => ({ ...current, confirmPassword: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="modal-footer border-0 px-4 pb-4 pt-0">
                    <button type="button" className="btn btn-light px-3 py-2 rounded-3" onClick={() => {
                      setResetStep('request');
                      setResetError('');
                      setResetMessage('');
                    }}>Change email</button>
                    <button type="submit" className="btn btn-primary px-4 py-2 rounded-3 fw-bold" style={{ backgroundColor: '#0a2d6d' }} disabled={resetLoading}>
                      {resetLoading ? 'Resetting...' : 'Reset password'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="modal-body p-4">
                  <div className="alert alert-success small rounded-3">{resetMessage}</div>
                  <button type="button" className="btn btn-primary w-100" style={{ backgroundColor: '#0a2d6d' }} onClick={closeResetModal}>
                    Back to login
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </section>
    </div>
  );

  return standalone ? loginContent : createPortal(loginContent, document.body);
};

export default LoginModal;