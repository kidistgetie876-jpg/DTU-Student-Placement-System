import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginModal from './LoginModal.jsx';

const Login = () => {
  const navigate = useNavigate();
  const closeLogin = useCallback(() => navigate('/', { replace: true }), [navigate]);
  return <LoginModal isOpen onClose={closeLogin} />;
};

export default Login;
