import React, { useEffect, useState } from 'react';
import api from '../../services/api.js';
import { useNavigate } from 'react-router-dom';
import { FiEye, FiEyeOff, FiLock, FiUser } from 'react-icons/fi';
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
  const [resetData, setResetData] = useState({ email: '', oldPassword: '', newPassword: '', confirmPassword: '' });
  const [resetError, setResetError] = useState('');

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

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (resetData.newPassword !== resetData.confirmPassword) {
      setResetError("New passwords do not match!");
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('auth/reset_password.php', resetData);
      if (response.data.status === 'success' || response.data.success === true) {
        alert("Success! Password changed.");
        setShowModal(false);
        setResetData({ email: '', oldPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setResetError(response.data.message);
      }
    } catch (err) { 
      setResetError("Server error."); 
    } finally {
      setLoading(false);
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
                      onClick={() => setShowModal(true)} 
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
                <h5 className="modal-title fw-bold">Reset Your Password</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
              </div>
              <form onSubmit={handleResetSubmit}>
                <div className="modal-body p-4">
                  {resetError && <div className="alert alert-danger small rounded-3">{resetError}</div>}
                  <div className="mb-3">
                    <label className="small fw-bold text-secondary">Email Address</label>
                    <input type="email" className="form-control py-2 rounded-3" placeholder="Enter your registered email" onChange={(e) => setResetData({...resetData, email: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                    <label className="small fw-bold text-secondary">Current (Old) Password</label>
                    <input type="password" className="form-control py-2 rounded-3" placeholder="Enter current password" onChange={(e) => setResetData({...resetData, oldPassword: e.target.value})} required />
                  </div>
                  <hr className="my-3 text-muted" />
                  <div className="mb-3">
                    <label className="small fw-bold text-secondary">New Password</label>
                    <input type="password" className="form-control py-2 rounded-3" placeholder="Enter new password" onChange={(e) => setResetData({...resetData, newPassword: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                    <label className="small fw-bold text-secondary">Confirm New Password</label>
                    <input type="password" className="form-control py-2 rounded-3" placeholder="Confirm new password" onChange={(e) => setResetData({...resetData, confirmPassword: e.target.value})} required />
                  </div>
                </div>
                <div className="modal-footer border-0 px-4 pb-4 pt-0">
                  <button type="button" className="btn btn-light px-3 py-2 rounded-3" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary px-4 py-2 rounded-3 fw-bold" style={{ backgroundColor: '#0a2d6d' }} disabled={loading}>
                    {loading ? 'Processing...' : 'Change Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;