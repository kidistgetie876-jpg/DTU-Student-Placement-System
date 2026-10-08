import React, { useEffect, useState } from 'react';
import api from '../../services/api.js';
import { useNavigate } from 'react-router-dom';
import { FiEye, FiEyeOff, FiLock, FiMail, FiUser } from 'react-icons/fi';
import dtuLogo from '../../assets/image.png';

const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [identifierUnlocked, setIdentifierUnlocked] = useState(false);
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Reset Password State
  const [showModal, setShowModal] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    setIdentifier('');
    setPassword('');
  }, []);

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
        navigate(routeMap[role] || '/login');
      } else {
        setError(getLoginError(response));
      }
    } catch (err) {
      setError(getLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  const closeResetModal = () => {
    setShowModal(false);
    setResetStep(1);
    setResetEmail('');
    setResetCode('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setShowResetPassword(false);
    setShowResetConfirmPassword(false);
    setResetError('');
    setResetSuccess('');
  };

  const handleSendVerificationCode = async (e) => {
    e.preventDefault();
    const email = resetEmail.trim();

    if (!isValidEmail(email)) {
      setResetError('Please enter a valid email address.');
      setResetSuccess('');
      return;
    }

    setResetLoading(true);
    setResetError('');
    setResetSuccess('');

    try {
      const response = await api.post('auth/request_reset_code.php', { email });
      if (response.data?.status !== 'success' && response.data?.success !== true) {
        throw new Error(response.data?.message || 'Unable to send verification code.');
      }

      setResetCode('');
      setResetStep(2);
      setResetSuccess('✓ Verification code sent to your email');
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Unable to send verification code.';
      setResetError(errorMessage);
      setResetSuccess('');
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyResetCode = async (e) => {
    e.preventDefault();
    const email = resetEmail.trim();
    const code = resetCode.trim();

    if (code.length !== 6) {
      setResetError('Please enter the 6-digit verification code from your email.');
      setResetSuccess('');
      return;
    }

    setResetLoading(true);
    setResetError('');
    setResetSuccess('');

    try {
      const response = await api.post('auth/verify_and_reset_password.php', {
        action: 'verify_only',
        email,
        code,
      });

      if (response.data?.status !== 'success' && response.data?.success !== true) {
        setResetError('Invalid code. Try again.');
        return;
      }

      setResetStep(3);
      setResetSuccess('');
    } catch {
      setResetError('Invalid code. Try again.');
      setResetSuccess('');
    } finally {
      setResetLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const email = resetEmail.trim();
    const code = resetCode.trim();

    if (resetNewPassword.length < 6) {
      setResetError('New password must be at least 6 characters long.');
      setResetSuccess('');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('New passwords do not match.');
      setResetSuccess('');
      return;
    }

    setResetLoading(true);
    setResetError('');
    setResetSuccess('');

    try {
      const response = await api.post('auth/verify_and_reset_password.php', {
        action: 'reset',
        email,
        code,
        newPassword: resetNewPassword,
        confirmPassword: resetConfirmPassword,
      });

      if (response.data?.status !== 'success' && response.data?.success !== true) {
        throw new Error(response.data?.message || 'Unable to change the password.');
      }

      setResetSuccess('✓ Password changed successfully!');
      setResetNewPassword('');
      setResetConfirmPassword('');
      setTimeout(() => closeResetModal(), 1500);
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Unable to change the password.';
      setResetError(errorMessage);
      setResetSuccess('');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div 
      style={{ 
        minHeight: 'calc(100vh - 160px)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '170px 15px 90px', // ከታች ከFooter ጋር እንዳይጋፋ በቂ ክፍተት (90px)
        background: 'linear-gradient(180deg, #f0f4fa 0%, #e5ecf6 100%)' 
      }}
    >
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-11 col-sm-9 col-md-6 col-lg-5 col-xl-4">
            
            {/* Modern Card */}
            <div 
              className="card border-0 shadow-lg" 
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
                  <h3 className="fw-bold mb-1" style={{ color: '#0a2d6d', letterSpacing: '-0.02em' }}>Portal Login</h3>
                  <p className="text-muted small mb-0">Sign in to access your DTU placement portal</p>
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
                      onClick={() => {
                        setResetStep(1);
                        setResetEmail('');
                        setResetCode('');
                        setResetNewPassword('');
                        setResetConfirmPassword('');
                        setShowResetPassword(false);
                        setShowResetConfirmPassword(false);
                        setResetError('');
                        setResetSuccess('');
                        setShowModal(true);
                      }}
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

      {/* --- RESET PASSWORD MODAL --- */}
      {showModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(10, 45, 109, 0.45)', backdropFilter: 'blur(4px)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '20px', overflow: 'hidden' }}>
              <div className="modal-header text-white px-4 py-3" style={{ backgroundColor: '#0a2d6d' }}>
                <h5 className="modal-title fw-bold">
                  {resetStep === 1 ? 'Forgot Password' : resetStep === 2 ? 'Verify Security Code' : 'Set New Password'}
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={closeResetModal}></button>
              </div>

              {resetStep === 1 ? (
                <form onSubmit={handleSendVerificationCode}>
                  <div className="modal-body p-4">
                    <div className="mb-4">
                      <label htmlFor="reset-email" className="small fw-bold text-secondary mb-2 d-block">Enter Registered Email</label>
                      <div className="input-group">
                        <span className="input-group-text bg-light border-end-0 text-muted" style={{ borderRadius: '12px 0 0 12px' }}>
                          <FiMail />
                        </span>
                        <input
                          id="reset-email"
                          type="email"
                          className="form-control border-start-0 py-2"
                          style={{ borderRadius: '0 12px 12px 0' }}
                          placeholder="Enter your registered email address"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          autoComplete="email"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="modal-footer border-0 px-4 pb-4 pt-0 d-flex flex-column align-items-stretch">
                    <button type="submit" className="btn btn-primary px-4 py-2 rounded-3 fw-bold" style={{ backgroundColor: '#0a2d6d' }} disabled={resetLoading}>
                      {resetLoading ? 'Sending...' : 'Send Verification Code'}
                    </button>
                    {resetError && <div className="alert alert-danger small rounded-3 mb-0 mt-2" role="alert">{resetError}</div>}
                    {resetSuccess && <div className="alert alert-success small rounded-3 mb-0 mt-2" role="status">{resetSuccess}</div>}
                    <button type="button" className="btn btn-light px-3 py-2 rounded-3 mt-2" onClick={closeResetModal}>Cancel</button>
                  </div>
                </form>
              ) : (
                resetStep === 2 ? (
                  <form onSubmit={handleVerifyResetCode}>
                    <div className="modal-body p-4">
                      <p className="small text-secondary mb-3">Enter the 6-digit code sent to your email</p>
                      <div className="mb-3">
                        <label htmlFor="reset-code" className="small fw-bold text-secondary mb-2 d-block">6-Digit Verification Code</label>
                        <input
                          id="reset-code"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          className="form-control py-2 rounded-3"
                          placeholder="Enter 6-digit code"
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          required
                        />
                      </div>
                    </div>

                    <div className="modal-footer border-0 px-4 pb-4 pt-0 d-flex flex-column align-items-stretch">
                      <button type="submit" className="btn btn-primary px-4 py-2 rounded-3 fw-bold" style={{ backgroundColor: '#0a2d6d' }} disabled={resetLoading}>
                        {resetLoading ? 'Verifying...' : 'Verify Code'}
                      </button>
                      {resetError && <div className="alert alert-danger small rounded-3 mb-0 mt-2" role="alert">{resetError}</div>}
                      {resetSuccess && <div className="alert alert-success small rounded-3 mb-0 mt-2" role="status">{resetSuccess}</div>}
                      <button type="button" className="btn btn-light px-3 py-2 rounded-3 mt-2" onClick={closeResetModal}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleChangePassword}>
                    <div className="modal-body p-4">
                      <div className="mb-3">
                        <label htmlFor="reset-new-password" className="small fw-bold text-secondary mb-2 d-block">New Password</label>
                        <div className="input-group">
                          <input
                            id="reset-new-password"
                            type={showResetPassword ? 'text' : 'password'}
                            className="form-control py-2"
                            style={{ borderRadius: '12px 0 0 12px' }}
                            placeholder="Minimum 6 characters"
                            minLength={6}
                            autoComplete="new-password"
                            value={resetNewPassword}
                            onChange={(e) => setResetNewPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="btn btn-light border text-muted"
                            style={{ borderRadius: '0 12px 12px 0' }}
                            aria-label={showResetPassword ? 'Hide new password' : 'Show new password'}
                            onClick={() => setShowResetPassword((current) => !current)}
                          >
                            {showResetPassword ? <FiEyeOff /> : <FiEye />}
                          </button>
                        </div>
                      </div>

                      <div className="mb-1">
                        <label htmlFor="reset-confirm-password" className="small fw-bold text-secondary mb-2 d-block">Confirm New Password</label>
                        <div className="input-group">
                          <input
                            id="reset-confirm-password"
                            type={showResetConfirmPassword ? 'text' : 'password'}
                            className="form-control py-2"
                            style={{ borderRadius: '12px 0 0 12px' }}
                            placeholder="Confirm your new password"
                            minLength={6}
                            autoComplete="new-password"
                            value={resetConfirmPassword}
                            onChange={(e) => setResetConfirmPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="btn btn-light border text-muted"
                            style={{ borderRadius: '0 12px 12px 0' }}
                            aria-label={showResetConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                            onClick={() => setShowResetConfirmPassword((current) => !current)}
                          >
                            {showResetConfirmPassword ? <FiEyeOff /> : <FiEye />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="modal-footer border-0 px-4 pb-4 pt-0 d-flex flex-column align-items-stretch">
                      <button type="submit" className="btn btn-primary px-4 py-2 rounded-3 fw-bold" style={{ backgroundColor: '#0a2d6d' }} disabled={resetLoading}>
                        {resetLoading ? 'Saving...' : 'Save New Password'}
                      </button>
                      {resetError && <div className="alert alert-danger small rounded-3 mb-0 mt-2" role="alert">{resetError}</div>}
                      {resetSuccess && <div className="alert alert-success small rounded-3 mb-0 mt-2" role="status">{resetSuccess}</div>}
                      <button type="button" className="btn btn-light px-3 py-2 rounded-3 mt-2" onClick={closeResetModal}>Cancel</button>
                    </div>
                  </form>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;