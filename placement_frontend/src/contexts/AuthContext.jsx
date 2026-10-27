import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

const readStoredUser = () => {
  try {
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
    return storedUser && typeof storedUser === 'object' ? storedUser : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readStoredUser);

  const updateUser = useCallback((updatedUser) => {
    if (!updatedUser || typeof updatedUser !== 'object') return;
    const nextUser = { ...(readStoredUser() || {}), ...updatedUser };
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
    window.dispatchEvent(new CustomEvent('user-profile-updated', { detail: nextUser }));
  }, []);

  useEffect(() => {
    const syncUser = (event) => {
      if (event.type === 'storage' && event.key !== 'user') return;
      const updatedUser = event.detail;
      setUser(updatedUser && typeof updatedUser === 'object' ? updatedUser : readStoredUser());
    };
    window.addEventListener('storage', syncUser);
    window.addEventListener('user-profile-updated', syncUser);
    return () => {
      window.removeEventListener('storage', syncUser);
      window.removeEventListener('user-profile-updated', syncUser);
    };
  }, []);

  const value = useMemo(() => ({ user, setUser, updateUser }), [user, updateUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
};
