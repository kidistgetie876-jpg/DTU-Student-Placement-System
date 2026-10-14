import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  Globe,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Moon,
  Settings,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import EditProfileModal from './EditProfileModal.jsx';
import './DashboardHeader.css';

const readStoredUser = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user && typeof user === 'object' ? user : {};
  } catch {
    return {};
  }
};

const getFullName = (user = {}) => user.full_name
  || user.fullname
  || user.name
  || [user.first_name, user.last_name].filter(Boolean).join(' ')
  || user.username
  || '';

const getAvatarUrl = (profile) => {
  const photo = profile.profile_photo || profile.avatar_url || profile.profile_image || profile.avatar;
  if (!photo) return '';
  if (/^(https?:|data:|blob:)/i.test(photo)) return photo;
  return `${api.defaults.baseURL.replace(/\/+$/, '')}/${String(photo).replace(/^\/+/, '')}`;
};

const DashboardHeader = ({
  variant = 'full',
  username,
  fullName,
  email,
  role,
  greeting = 'Welcome back',
  profileDetail,
  dashboardPath,
  notificationCount = 0,
  onSelectTab,
  notificationsTab,
}) => {
  const { isDarkMode, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const [profile, setProfile] = useState(() => readStoredUser());
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const actionsRef = useRef(null);
  const displayName = fullName || getFullName(profile) || username || 'User';
  const displayEmail = email || profile.email || '';
  const rawRole = String(profile.role || role || 'User').trim().toLowerCase();
  const profileRole = ({
    admin: 'System Admin',
    registrar: 'Registrar',
    head: 'Department Head',
    'head of department': 'Department Head',
    student: 'Student',
  })[rawRole] || rawRole;
  const displayRole = t(profileRole);
  const avatarUrl = getAvatarUrl(profile);
  const showControls = variant !== 'welcome';
  const showGreeting = variant !== 'navigation';

  useEffect(() => {
    if (!showControls) return undefined;
    let isCurrent = true;
    api.get('api/common/get_profile.php')
      .then((response) => {
        if (!response.data?.success || !response.data?.profile) {
          throw new Error(response.data?.message || 'Unable to load profile.');
        }
        if (isCurrent) {
          setProfile((current) => ({ ...current, ...response.data.profile }));
        }
      })
      .catch((error) => {
        if (!isCurrent) return;
        console.error('Unable to load the current user profile:', error);
      });

    const syncProfile = () => setProfile((current) => ({ ...current, ...readStoredUser() }));
    window.addEventListener('user-profile-updated', syncProfile);
    return () => {
      isCurrent = false;
      window.removeEventListener('user-profile-updated', syncProfile);
    };
  }, [showControls]);

  useEffect(() => {
    if (!showControls || (!openMenu && !modal)) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!actionsRef.current?.contains(event.target)) setOpenMenu(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setModal(null);
        setModalError('');
        setModalSuccess('');
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [modal, openMenu, showControls]);

  const selectTab = (tab) => {
    if (tab && onSelectTab) onSelectTab(tab);
    setOpenMenu(null);
  };

  const signOut = () => {
    localStorage.removeItem('user');
    ['token', 'accessToken', 'authToken'].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    sessionStorage.removeItem('registrarActiveTab');
    window.dispatchEvent(new Event('user-logged-out'));
    setOpenMenu(null);
    navigate('/login', { replace: true });

    Promise.resolve()
      .then(() => api.post('auth/logout.php'))
      .catch((error) => {
        console.error('Unable to invalidate the server login session:', error);
      });
  };

  const goToDashboard = () => {
    setOpenMenu(null);
    const roleRoutes = {
      admin: '/admin-dashboard',
      registrar: '/registrar-dashboard/overview',
      head: '/head-dashboard',
      'head of department': '/head-dashboard',
      student: '/student-dashboard',
    };
    const route = dashboardPath || roleRoutes[rawRole];
    if (route) navigate(route);
  };

  const openModal = (nextModal) => {
    setOpenMenu(null);
    setModalError('');
    setModalSuccess('');
    if (nextModal === 'password') {
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    }
    setModal(nextModal);
  };

  const closeModal = () => {
    setModal(null);
    setModalError('');
    setModalSuccess('');
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setModalError('');
    setModalSuccess('');
    if (passwordForm.new_password.length < 8) {
      setModalError('New password must be at least 8 characters long.');
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setModalError('New password and confirmation do not match.');
      return;
    }

    try {
      const response = await api.post('api/common/change_password.php', passwordForm);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to change password.');
      }
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      setModalSuccess(response.data.message || 'Password changed successfully.');
    } catch (error) {
      setModalError(error.response?.data?.message || error.message || 'Unable to change password.');
    }
  };

  const changeLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    setOpenMenu(null);
  };

  const handleProfileSaved = (updatedProfile) => {
    setProfile((current) => ({ ...current, ...updatedProfile }));
    const storedUser = readStoredUser();
    localStorage.setItem('user', JSON.stringify({ ...storedUser, ...updatedProfile }));
    window.dispatchEvent(new Event('user-profile-updated'));
  };

  const count = Number(notificationCount);

  return (
    <>
      {showGreeting && (
        <header className="dashboard-topbar mb-4">
          <div className="dashboard-topbar-copy">
            <h2 className="fw-bold mb-0">
              {t(greeting)}, <span>{username || profile.username || displayName}</span>!
            </h2>
          </div>
        </header>
      )}

      {showControls && (
        <div className={variant === 'navigation' ? 'dashboard-header-navigation' : 'dashboard-topbar-actions'} ref={actionsRef}>
          <div className="dashboard-header-menu-anchor">
            <button
              type="button"
              className="dashboard-control-button dashboard-language-trigger"
              aria-label={t('Select language')}
              aria-expanded={openMenu === 'language'}
              aria-haspopup="menu"
              onClick={() => setOpenMenu((current) => current === 'language' ? null : 'language')}
            >
              <Globe size={18} aria-hidden="true" />
              <span>{language === 'am' ? 'አማርኛ' : 'English'}</span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            {openMenu === 'language' && (
              <div className="dashboard-dropdown dashboard-language-dropdown" role="menu" aria-label={t('Select language')}>
                <button type="button" role="menuitemradio" aria-checked={language === 'en'} onClick={() => changeLanguage('en')}>
                  English
                </button>
                <button type="button" role="menuitemradio" aria-checked={language === 'am'} onClick={() => changeLanguage('am')}>
                  አማርኛ
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="dashboard-control-button dashboard-notifications-button"
            aria-label={t('Notifications') + (count > 0 ? ` (${count})` : '')}
            title={t('Notifications')}
            onClick={() => selectTab(notificationsTab)}
          >
            <Bell size={18} aria-hidden="true" />
            {count > 0 && <span className="dashboard-notification-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
          </button>

          <button
            type="button"
            className="dashboard-control-button dashboard-theme-button"
            onClick={toggleTheme}
            aria-label={t(isDarkMode ? 'Switch to light mode' : 'Switch to dark mode')}
            title={t(isDarkMode ? 'Switch to light mode' : 'Switch to dark mode')}
          >
            {isDarkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>

          <div className="dashboard-header-menu-anchor dashboard-profile-menu-anchor">
            <button
              type="button"
              className="dashboard-profile-trigger"
              aria-label={`${displayName}${displayEmail ? `, ${displayEmail}` : ''}`}
              aria-expanded={openMenu === 'profile'}
              aria-haspopup="menu"
              onClick={() => setOpenMenu((current) => current === 'profile' ? null : 'profile')}
            >
              <span className="dashboard-profile-avatar" aria-hidden="true">
                {avatarUrl ? <img src={avatarUrl} alt="" /> : <UserRound size={19} />}
              </span>
              <span className="dashboard-profile-trigger-copy">
                <strong>{displayEmail || displayName}</strong>
                <small>{displayName}{profileDetail ? ` · ${profileDetail}` : ''}</small>
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>

            {openMenu === 'profile' && (
              <div className="dashboard-dropdown dashboard-profile-dropdown" role="menu" aria-label={t('User profile menu')}>
                <div className="dashboard-dropdown-user">
                  <div className="dashboard-dropdown-user-heading">
                    <span className="dashboard-profile-avatar" aria-hidden="true">
                      {avatarUrl ? <img src={avatarUrl} alt="" /> : <UserRound size={19} />}
                    </span>
                    <div className="dashboard-dropdown-user-identity">
                      <strong>{displayName}</strong>
                      {displayEmail && <span>{displayEmail}</span>}
                    </div>
                  </div>
                  <span className="dashboard-role-pill">{displayRole}</span>
                </div>
                <div className="dashboard-dropdown-divider" />
                <button type="button" role="menuitem" onClick={goToDashboard}>
                  <LayoutDashboard size={18} aria-hidden="true" />
                  <span>{t('My Dashboard')}</span>
                </button>
                <button type="button" role="menuitem" onClick={() => openModal('profile')}>
                  <UserRound size={18} aria-hidden="true" />
                  <span>{t('View Profile / Edit Profile')}</span>
                </button>
                <button type="button" role="menuitem" onClick={() => openModal('password')}>
                  <LockKeyhole size={18} aria-hidden="true" />
                  <span>{t('Change Password')}</span>
                </button>
                <button type="button" role="menuitem" onClick={() => openModal('settings')}>
                  <Settings size={18} aria-hidden="true" />
                  <span>{t('Dashboard Settings')}</span>
                </button>
                <div className="dashboard-dropdown-divider" />
                <button type="button" role="menuitem" className="dashboard-signout-item" onClick={signOut}>
                  <LogOut size={18} aria-hidden="true" />
                  <span>{t('Sign Out')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {modal === 'profile' && (
        <EditProfileModal profile={{ ...profile, full_name: getFullName(profile) || displayName }} onClose={closeModal} onSaved={handleProfileSaved} />
      )}

      {modal === 'password' && (
        <div className="dashboard-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}>
          <section className="dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-modal-title">
            <div className="dashboard-modal-header">
              <h3 id="dashboard-modal-title">Change Password</h3>
              <button type="button" className="dashboard-modal-close" aria-label="Close" onClick={closeModal}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {modalError && <div className="alert alert-danger py-2" role="alert">{modalError}</div>}
            {modalSuccess && <div className="alert alert-success py-2" role="status">{modalSuccess}</div>}
            <form onSubmit={changePassword}>
              <label className="form-label" htmlFor="dashboard-current-password">Current Password</label>
              <input
                id="dashboard-current-password"
                className="form-control mb-3"
                type="password"
                autoComplete="current-password"
                required
                value={passwordForm.current_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
              />
              <label className="form-label" htmlFor="dashboard-new-password">New Password</label>
              <input
                id="dashboard-new-password"
                className="form-control mb-3"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={passwordForm.new_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
              />
              <label className="form-label" htmlFor="dashboard-confirm-password">Confirm New Password</label>
              <input
                id="dashboard-confirm-password"
                className="form-control mb-3"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={passwordForm.confirm_password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))}
              />
              <div className="dashboard-modal-actions">
                <button type="button" className="btn btn-outline-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary">Change Password</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {modal === 'settings' && (
        <div className="dashboard-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}>
          <section className="dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-modal-title">
            <div className="dashboard-modal-header">
              <h3 id="dashboard-modal-title">{t('Dashboard Settings')}</h3>
              <button type="button" className="dashboard-modal-close" aria-label="Close" onClick={closeModal}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="dashboard-settings-form">
              <fieldset>
                <legend>{t('Language')}</legend>
                <div className="dashboard-settings-options">
                  <button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
                  <button type="button" className={language === 'am' ? 'active' : ''} aria-pressed={language === 'am'} onClick={() => setLanguage('am')}>አማርኛ</button>
                </div>
              </fieldset>
              <fieldset>
                <legend>{t('Appearance')}</legend>
                <button type="button" className="dashboard-settings-theme" onClick={toggleTheme}>
                  {isDarkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
                  <span>{t(isDarkMode ? 'Switch to light mode' : 'Switch to dark mode')}</span>
                </button>
              </fieldset>
            </div>
          </section>
        </div>
      )}
    </>
  );
};

export default DashboardHeader;
