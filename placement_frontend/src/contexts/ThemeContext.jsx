import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import './ThemeContext.css';

const ThemeContext = createContext(null);

const getInitialTheme = () => {
  const storedTheme = localStorage.getItem('themeMode');
  if (['light', 'dark', 'eye-care'].includes(storedTheme)) return storedTheme;
  return localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light';
};

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState(getInitialTheme);
  const isDarkMode = themeMode === 'dark';
  const isEyeCareMode = themeMode === 'eye-care';

  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', isDarkMode);
    document.body.classList.toggle('dark-mode', isDarkMode);
    document.documentElement.classList.toggle('eye-care-mode', isEyeCareMode);
    document.body.classList.toggle('eye-care-mode', isEyeCareMode);
    localStorage.setItem('themeMode', themeMode);
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode, isEyeCareMode, themeMode]);

  useEffect(() => {
    const syncTheme = (event) => {
      if (event.key === 'themeMode' && ['light', 'dark', 'eye-care'].includes(event.newValue)) {
        setThemeMode(event.newValue);
      } else if (event.key === 'darkMode' && !localStorage.getItem('themeMode')) {
        setThemeMode(event.newValue === 'true' ? 'dark' : 'light');
      }
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const value = useMemo(() => ({
    isDarkMode,
    isEyeCareMode,
    themeMode,
    setThemeMode,
    toggleTheme: () => setThemeMode((current) => current === 'dark' ? 'light' : 'dark'),
    toggleEyeCareMode: () => setThemeMode((current) => current === 'eye-care' ? 'light' : 'eye-care'),
  }), [isDarkMode, isEyeCareMode, themeMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider.');
  return context;
};
