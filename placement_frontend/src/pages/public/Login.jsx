import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';

const isHtmlResponse = (data) =>
  typeof data === 'string' && /<(?:!doctype\s+html|html)\b/i.test(data);

const Login = () => {
  const [isStudentLogin, setIsStudentLogin] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [credential, setCredential] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!identifier.trim() || !credential.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      const payload = isStudentLogin
        ? { admission_number: identifier.trim(), given_name: credential.trim() }
        : { username_or_email: identifier.trim(), password: credential.trim() };

      const response = await api.post('auth/login.php', payload);

      const data = response.data;
      if (isHtmlResponse(data)) {
        setError('The login service returned a web page instead of JSON. Check the backend URL and redeploy the API.');
        return;
      }

      if (data?.status === 'success' || data?.success) {
        // 1. የተጠቃሚውን መረጃ እና ሮል በ localStorage እናስቀምጣለን
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
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(data?.message || 'Login failed.');
      }
    } catch (err) {
      const responseData = err.response?.data;
      setError(
        isHtmlResponse(responseData)
          ? 'The login service returned a web page instead of JSON. Check the backend URL and redeploy the API.'
          : responseData?.message || 'Invalid credentials or connection issue.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container d-flex justify-content-center align-items-center min-vh-100">
      <div className="card shadow border-0 p-4" style={{ width: '100%', maxWidth: '420px', borderRadius: '16px' }}>
        <div className="text-center mb-4">
          <h3 className="fw-bold" style={{ color: '#0c1f4d' }}>System Login</h3>
          
          <div className="btn-group w-100 mt-3" role="group">
            <button
              type="button"
              className={`btn btn-sm ${isStudentLogin ? 'btn-dark' : 'btn-outline-secondary'}`}
              onClick={() => { setIsStudentLogin(true); setError(''); setIdentifier(''); setCredential(''); }}
            >
              Student Login
            </button>
            <button
              type="button"
              className={`btn btn-sm ${!isStudentLogin ? 'btn-dark' : 'btn-outline-secondary'}`}
              onClick={() => { setIsStudentLogin(false); setError(''); setIdentifier(''); setCredential(''); }}
            >
              Staff Login (Admin/Registrar)
            </button>
          </div>
        </div>

        {error && <div className="alert alert-danger py-2 small" role="alert">{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <label className="form-label fw-semibold small">
              {isStudentLogin ? 'Admission ID / Number' : 'Username or Email'}
            </label>
            <input
              type="text"
              className="form-control"
              placeholder={isStudentLogin ? 'e.g. DTU16R2001' : 'e.g. admin or admin@dtu.edu.et'}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>

          <div className="mb-4">
            <label className="form-label fw-semibold small">
              {isStudentLogin ? 'First Name (Given Name)' : 'Password'}
            </label>
            <input
              type={isStudentLogin ? 'text' : 'password'}
              className="form-control"
              placeholder={isStudentLogin ? 'e.g. Abebe' : 'Enter password'}
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn w-100 fw-semibold text-white py-2"
            style={{ backgroundColor: '#0c1f4d', borderRadius: '8px' }}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'LOGIN'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;