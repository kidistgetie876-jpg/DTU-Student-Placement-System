import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import './DashboardHeader.css';

const DashboardHeader = ({ username, role, subtitle, greeting = 'Welcome back', profileDetail }) => {
  const { isDarkMode, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="dashboard-topbar mb-4">
      <div className="dashboard-topbar-copy">
        <h2 className="fw-bold mb-1">{t(greeting)}, <span>{username}</span>!</h2>
        <p className="mb-0">{t(subtitle)}</p>
      </div>
      <div className="dashboard-topbar-actions">
        <div className="dashboard-profile" aria-label={`${t(role)}: ${username}`}>
          <span className="dashboard-profile-avatar" aria-hidden="true">
            {String(username || '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="dashboard-profile-details">
            <strong>{username}</strong>
            <small>{t(role)}{profileDetail ? ` · ${profileDetail}` : ''}</small>
          </span>
        </div>
        <button
          type="button"
          className="dashboard-control-button"
          onClick={toggleTheme}
          aria-label={t(isDarkMode ? 'Switch to light mode' : 'Switch to dark mode')}
          title={t(isDarkMode ? 'Switch to light mode' : 'Switch to dark mode')}
        >
          {isDarkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
        <div className="dashboard-language-control" role="group" aria-label={t('Select language')}>
          <button
            type="button"
            className={language === 'en' ? 'active' : ''}
            onClick={() => setLanguage('en')}
            aria-pressed={language === 'en'}
          >
            EN
          </button>
          <button
            type="button"
            className={language === 'am' ? 'active' : ''}
            onClick={() => setLanguage('am')}
            aria-pressed={language === 'am'}
          >
            አማ
          </button>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
