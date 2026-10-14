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

const DashboardHeader = ({
  username,
  fullName,
  email,
  role,
  subtitle,
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
  const [profileError, setProfileError] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '' });
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
  const avatarUrl = profile.avatar_url || profile.profile_image || profile.avatar;

  useEffect(() => {
    let isCurrent = true;
    api.get('api/common/get_profile.php')
      .then((response) => {
        if (!response.data?.success || !response.data?.profile) {
          throw new Error(response.data?.message || 'Unable to load profile.');
        }
        if (isCurrent) {
          setProfile((current) => ({ ...current, ...response.data.profile }));
          setProfileError('');
        }
      })
      .catch((error) => {
        if (!isCurrent) return;
        const message = error.response?.data?.message || error.message || 'Unable to load profile.';
        setProfileError(message);
        console.error('Unable to load the current user profile:', error);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!openMenu && !modal) return undefined;

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
  }, [modal, openMenu]);

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
      student: '/student-dashboard',
    };
    const route = dashboardPath || roleRoutes[rawRole];
    if (route) navigate(route);
  };

  const openModal = (nextModal) => {
    setOpenMenu(null);
    setModalError('');
    setModalSuccess('');
    if (nextModal === 'profile') {
      setProfileForm({
        full_name: getFullName(profile) || username || '',
        email: displayEmail,
      });
    }
    if (nextModal === 'password') {
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    }
    setModal(nextModal);
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setModalError('');
    setModalSuccess('');
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setModalError('');
    setModalSuccess('');
    const nextName = profileForm.full_name.trim();
    const nextEmail = profileForm.email.trim();
    if (!nextName) {
      setModalError('Enter your full name.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) {
      setModalError('Enter a valid email address.');
      return;
    }

    setSaving(true);
    try {
      const response = await api.post('api/common/update_profile.php', {
        full_name: nextName,
        email: nextEmail,
      });
      if (!response.data?.success || !response.data?.profile) {
        throw new Error(response.data?.message || 'Unable to update profile.');
      }
      const updatedProfile = response.data.profile;
      setProfile((current) => ({ ...current, ...updatedProfile }));
      const storedUser = readStoredUser();
      localStorage.setItem('user', JSON.stringify({ ...storedUser, ...updatedProfile }));
      window.dispatchEvent(new Event('user-profile-updated'));
      setModalSuccess(response.data.message || 'Profile updated successfully.');
    } catch (error) {
      setModalError(error.response?.data?.message || error.message || 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
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

    setSaving(true);
    try {
      const response = await api.post('api/common/change_password.php', passwordForm);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to change password.');
      }
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      setModalSuccess(response.data.message || 'Password changed successfully.');
    } catch (error) {
      setModalError(error.response?.data?.message || error.message || 'Unable to change password.');
    } finally {
      setSaving(false);
    }
  };

  const changeLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    setOpenMenu(null);
  };

  const count = Number(notificationCount);

  return (
    <header className="dashboard-topbar mb-4">
      <div className="dashboard-topbar-copy">
        <h2 className="fw-bold mb-1">{t(greeting)}, <span>{username || profile.username || displayName}</span>!</h2>
        <p className="mb-0">{t(subtitle)}</p>
      </div>

      <div className="dashboard-topbar-actions" ref={actionsRef}>
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
              <button
                type="button"
                role="menuitemradio"
                aria-checked={language === 'en'}
                onClick={() => changeLanguage('en')}
              >
                English
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={language === 'am'}
                onClick={() => changeLanguage('am')}
              >
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
          {count > 0 && (
            <span className="dashboard-notification-badge" aria-hidden="true">
              {count > 99 ? '99+' : count}
            </span>
          )}
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
              {avatarUrl
                ? <img src={avatarUrl} alt="" />
                : <UserRound size={19} />}
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
                <strong>{displayName}</strong>
                {displayEmail && <span>{displayEmail}</span>}
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

      {modal && (
        <div className="dashboard-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}>
          <section
            className="dashboard-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-modal-title"
          >
            <div className="dashboard-modal-header">
              <h3 id="dashboard-modal-title">
                {modal === 'profile' && 'Edit Profile'}
                {modal === 'password' && 'Change Password'}
                {modal === 'settings' && t('Dashboard Settings')}
              </h3>
              <button type="button" className="dashboard-modal-close" aria-label="Close" onClick={closeModal} disabled={saving}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            {modalError && <div className="alert alert-danger py-2" role="alert">{modalError}</div>}
            {modalSuccess && <div className="alert alert-success py-2" role="status">{modalSuccess}</div>}
            {modal === 'profile' && profileError && !modalSuccess && (
              <div className="alert alert-warning py-2" role="status">{profileError}</div>
            )}

            {modal === 'profile' && (
              <form onSubmit={saveProfile}>
                <label className="form-label" htmlFor="dashboard-profile-name">Full Name</label>
                <input
                  id="dashboard-profile-name"
                  className="form-control mb-3"
                  type="text"
                  autoComplete="name"
                  maxLength={200}
                  required
                  value={profileForm.full_name}
                  onChange={(event) => setProfileForm((current) => ({ ...current, full_name: event.target.value }))}
                />
                <label className="form-label" htmlFor="dashboard-profile-email">Email</label>
                <input
                  id="dashboard-profile-email"
                  className="form-control mb-3"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={profileForm.email}
                  onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                />
                <div className="dashboard-modal-actions">
                  <button type="button" className="btn btn-outline-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Profile'}
                  </button>
                </div>
              </form>
            )}

            {modal === 'password' && (
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
                  <button type="button" className="btn btn-outline-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Changing…' : 'Change Password'}
                  </button>
                </div>
              </form>
            )}

            {modal === 'settings' && (
              <div className="dashboard-settings-form">
                <fieldset>
                  <legend>{t('Language')}</legend>
                  <div className="dashboard-settings-options">
                    <button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>
                      English
                    </button>
                    <button type="button" className={language === 'am' ? 'active' : ''} aria-pressed={language === 'am'} onClick={() => setLanguage('am')}>
                      አማርኛ
                    </button>
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
            )}
          </section>
        </div>
      )}
    </header>
  );
};

export default DashboardHeader;
