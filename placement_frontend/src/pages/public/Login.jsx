import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginModal from './LoginModal.jsx';

const Login = () => {
  const navigate = useNavigate();
  const closeLogin = useCallback((options = {}) => {
    if (!options.authenticated) navigate('/', { replace: true });
  }, [navigate]);
  return <LoginModal isOpen onClose={closeLogin} standalone />;
};

export default Login;
