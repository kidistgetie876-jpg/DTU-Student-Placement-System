import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api.js';
import { useNavigate } from 'react-router-dom';
import { FiEye, FiEyeOff, FiLock, FiUser } from 'react-icons/fi';
import dtuLogo from '../../assets/image.png';
import './LoginModal.css';

const noop = () => {};

const LoginModal = ({ isOpen = true, onClose = noop }) => {
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimer = useRef(null);
  const previousFocus = useRef(null);
  const identifierInput = useRef(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [identifierUnlocked, setIdentifierUnlocked] = useState(false);
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
      return 'Please enter the correct email orusername.';
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
      const response = await api.post('auth/login.php', { identifier: trimmedIdentifier, password });
      if (response.data.status === 'success' || response.data.success === true) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
        const role = normalizeRole(response.data.user.role);
        const routeMap = { 
          admin: '/admin-dashboard', 
          registrar: '/registrar-dashboard', 
          student: '/student-dashboard', 
          head: '/head-dashboard' 
        };
        onClose({ authenticated: true });
        navigate(routeMap[role] || '/');
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

  if (!isRendered) return null;

  return createPortal(
    <div
      className={`login-modal-backdrop${isClosing ? ' is-closing' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeLoginModal();
      }}
    >
      <section
        className="login-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        aria-describedby="login-modal-description"
      >
        <button type="button" className="login-modal-close" aria-label="Close dialog" onClick={closeLoginModal}>
          <span aria-hidden="true">&times;</span>
        </button>
        <div className="container-fluid px-0">
        <div className="row justify-content-center">
          <div className="col-12">
            
            {/* Modern Card */}
            <div 
              className="card login-modal-card border-0 shadow-lg" 
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
                {/* Brand Logo & Title */}
                <div className="text-center mb-4">
                  <img 
                    src={dtuLogo} 
                    alt="DTU Logo" 
                    style={{ width: 68, height: 68, borderRadius: '16px', padding: '4px', border: '2px solid #f4c95d', marginBottom: '12px' }} 
                  />
                  <h3 id="login-modal-title" className="fw-bold mb-1" style={{ color: '#0a2d6d', letterSpacing: '-0.02em' }}>Portal Login</h3>
                  <p id="login-modal-description" className="text-muted small mb-0">Sign in to access your DTU placement portal</p>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="alert alert-danger py-2 px-3 small text-center rounded-3 mb-3 border-0 shadow-sm" style={{ backgroundColor: '#ffebe8', color: '#c92a2a' }}>
                    {error}
                  </div>
                )}
                
                <form onSubmit={handleLogin} autoComplete="new-password">
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
                        name="account-value" 
                        type="text" 
                        autoComplete="new-password" 
                        data-lpignore="true" 
                        data-1p-ignore="true" 
                        readOnly={!identifierUnlocked} 
                        placeholder=" Enter your email or username" 
                        className="form-control border-start-0 bg-light py-2" 
                        style={{ borderRadius: '0 12px 12px 0', fontSize: '0.95rem' }}
                        value={identifier} 
                        onFocus={() => setIdentifierUnlocked(true)} 
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
                        name="password-value" 
                        type={showPassword ? 'text' : 'password'} 
                        autoComplete="new-password" 
                        data-lpignore="true" 
                        data-1p-ignore="true" 
                        readOnly={!passwordUnlocked} 
                        placeholder="Enter your password" 
                        className="form-control border-start-0 border-end-0 bg-light py-2" 
                        style={{ fontSize: '0.95rem' }}
                        value={password} 
                        onFocus={() => setPasswordUnlocked(true)} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                      />
                      <button 
                        type="button" 
                        className="btn btn-light border border-start-0 text-muted" 
                        style={{ borderRadius: '0 12px 12px 0' }}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <FiEyeOff /> : <FiEye />}
                      </button>
                    </div>
                    <div className="form-text small text-muted" style={{ fontSize: '11px' }}>
                      Tip: New students can use their Student ID as default password.
                    </div>
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

                  {/* Forgot Password */}
                  <div className="text-center mt-3 pt-1">
                    <button 
                      type="button" 
                      onClick={openResetModal}
                      className="btn btn-link btn-sm text-decoration-none fw-semibold"
                      style={{ color: '#0a2d6d' }}
                    >
                      Forgot Password?
                    </button>
                  </div>
                </form>
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
                      <input
                        id="reset-new-password"
                        type="password"
                        minLength={6}
                        className="form-control py-2 rounded-3"
                        autoComplete="new-password"
                        value={resetData.newPassword}
                        onChange={(e) => setResetData((current) => ({ ...current, newPassword: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label htmlFor="reset-confirm-password" className="small fw-bold text-secondary">Confirm New Password</label>
                      <input
                        id="reset-confirm-password"
                        type="password"
                        minLength={6}
                        className="form-control py-2 rounded-3"
                        autoComplete="new-password"
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
    </div>,
    document.body
  );
};

export default LoginModal;