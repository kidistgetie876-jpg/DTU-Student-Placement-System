import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  ChevronDown,
  Eye,
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
import ChangePasswordModal from './ChangePasswordModal.jsx';
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
}) => {
  const { isDarkMode, isEyeCareMode, toggleTheme, toggleEyeCareMode, setThemeMode } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const [profile, setProfile] = useState(() => readStoredUser());
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [notificationActionError, setNotificationActionError] = useState('');
  const [markingAllNotifications, setMarkingAllNotifications] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState(null);
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
  const unreadNotifications = notifications.filter((notification) => (
    Number(notification.is_read) === 0 || notification.is_read === false || notification.read === false
  )).length;

  useEffect(() => {
    const storedUser = readStoredUser();
    const hasStoredUser = !!storedUser && Object.keys(storedUser).length > 0;
    if (!showControls || !hasStoredUser || !api || typeof api.get !== 'function') return undefined;

    let isCurrent = true;
    const profileRequest = api.get('api/common/get_profile.php');
    if (!profileRequest || typeof profileRequest.then !== 'function') {
      return undefined;
    }

    profileRequest
      .then((response) => {
        if (!response?.data) {
          return;
        }
        if (!response.data?.success || !response.data?.profile) {
          throw new Error(response.data?.message || 'Unable to load profile.');
        }
        if (isCurrent) {
          setProfile((current) => ({ ...current, ...response.data.profile }));
        }
      })
      .catch((error) => {
        if (!isCurrent) return;
        if (error.response?.status === 401 || error.response?.status === 404) {
          localStorage.removeItem('user');
          return;
        }
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
    const storedUser = readStoredUser();
    const hasStoredUser = !!storedUser && Object.keys(storedUser).length > 0;
    if (!showControls || !hasStoredUser || !api || typeof api.get !== 'function') return undefined;

    let isCurrent = true;
    let requestInProgress = false;

    const loadNotifications = async () => {
      if (requestInProgress) return;
      requestInProgress = true;
      try {
        const response = await Promise.resolve(api.get('api/common/get_notifications.php'));
        if (!response?.data) {
          setNotifications([]);
          setNotificationsError('');
          return;
        }
        if (!response.data?.success || !Array.isArray(response.data.notifications)) {
          throw new Error(response.data?.message || 'Unable to load notifications.');
        }
        if (isCurrent) {
          setNotifications(response.data.notifications);
          setNotificationsError('');
        }
      } catch (error) {
        if (!isCurrent) return;
        if (error.response?.status === 401 || error.response?.status === 404) {
          setNotifications([]);
          setNotificationsError('');
          return;
        }
        setNotificationsError(error.response?.data?.message || error.message || 'Unable to load notifications.');
        console.error('Unable to load dashboard notifications:', error);
      } finally {
        requestInProgress = false;
      }
    };

    setNotificationsLoading(true);
    loadNotifications().finally(() => {
      if (isCurrent) setNotificationsLoading(false);
    });
    const intervalId = window.setInterval(loadNotifications, 60 * 1000);
    const refreshOnFocus = () => loadNotifications();
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshOnFocus);
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

  const markNotificationRead = async (notification) => {
    if (Number(notification.is_read) !== 0 && notification.is_read !== false && notification.read !== false) return;
    setNotificationActionError('');
    setMarkingNotificationId(notification.id);
    try {
      const response = await api.post('api/common/mark_notifications_read.php', {
        notification_id: Number(notification.id),
        notification_type: notification.notification_type || 'general',
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to mark notification as read.');
      }
      setNotifications((current) => current.map((item) => (
        String(item.id) === String(notification.id)
          && (item.notification_type || 'general') === (notification.notification_type || 'general')
          ? { ...item, is_read: 1, read: true }
          : item
      )));
    } catch (error) {
      setNotificationActionError(error.response?.data?.message || error.message || 'Unable to mark notification as read.');
      console.error('Unable to mark dashboard notification as read:', error);
    } finally {
      setMarkingNotificationId(null);
    }
  };

  const markAllNotificationsRead = async () => {
    setNotificationActionError('');
    setMarkingAllNotifications(true);
    try {
      const response = await api.post('api/common/mark_notifications_read.php', { mark_all: true });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to mark notifications as read.');
      }
      setNotifications((current) => current.map((item) => ({ ...item, is_read: 1, read: true })));
    } catch (error) {
      setNotificationActionError(error.response?.data?.message || error.message || 'Unable to mark notifications as read.');
      console.error('Unable to mark all dashboard notifications as read:', error);
    } finally {
      setMarkingAllNotifications(false);
    }
  };

  const handleProfileSaved = (updatedProfile) => {
    setProfile((current) => ({ ...current, ...updatedProfile }));
    const storedUser = readStoredUser();
    localStorage.setItem('user', JSON.stringify({ ...storedUser, ...updatedProfile }));
    window.dispatchEvent(new Event('user-profile-updated'));
  };

  const count = unreadNotifications;

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
              className="dashboard-control-button dashboard-language-trigger dashboard-accent-indigo"
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
            className="dashboard-control-button dashboard-notifications-button dashboard-accent-amber"
            aria-label={t('Notifications') + (count > 0 ? ` (${count})` : '')}
            title={t('Notifications')}
            aria-expanded={openMenu === 'notifications'}
            aria-haspopup="dialog"
            onClick={() => {
              setNotificationActionError('');
              setOpenMenu((current) => current === 'notifications' ? null : 'notifications');
            }}
          >
            <Bell size={18} aria-hidden="true" />
            {count > 0 && <span className="dashboard-notification-badge" aria-hidden="true">{count}</span>}
          </button>
          {openMenu === 'notifications' && (
            <section className="dashboard-dropdown dashboard-notifications-dropdown" role="dialog" aria-label={t('Notifications')}>
              <div className="dashboard-notifications-header">
                <div>
                  <strong>{t('Notifications')}</strong>
                  <span>{count} {t('unread')}</span>
                </div>
                <button
                  type="button"
                  className="dashboard-mark-all-read"
                  onClick={markAllNotificationsRead}
                  disabled={markingAllNotifications || count === 0}
                >
                  {markingAllNotifications ? t('Marking...') : t('Mark all as read')}
                </button>
              </div>
              {notificationActionError && <p className="dashboard-notifications-error" role="alert">{notificationActionError}</p>}
              {notificationsLoading && notifications.length === 0 && <p className="dashboard-notifications-empty">{t('Loading notifications...')}</p>}
              {!notificationsLoading && notificationsError && (
                <p className="dashboard-notifications-error" role="alert">{notificationsError}</p>
              )}
              {!notificationsLoading && !notificationsError && notifications.length === 0 && (
                <p className="dashboard-notifications-empty">{t('No notifications.')}</p>
              )}
              {notifications.length > 0 && (
                <ul className="dashboard-notifications-list">
                  {notifications.map((notification) => {
                    const unread = Number(notification.is_read) === 0 || notification.is_read === false || notification.read === false;
                    const key = `${notification.notification_type || 'general'}-${notification.id}`;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          className={`dashboard-notification-item${unread ? ' is-unread' : ''}`}
                          onClick={() => markNotificationRead(notification)}
                          disabled={String(markingNotificationId) === String(notification.id)}
                        >
                          <span className="dashboard-notification-item-heading">
                            <strong>{notification.title || t('Notification')}</strong>
                            {unread && <span className="dashboard-notification-unread-dot" aria-label={t('Unread')} />}
                          </span>
                          <span className="dashboard-notification-message">{notification.message || ''}</span>
                          <small>{notification.created_at ? new Date(notification.created_at).toLocaleString() : ''}</small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          <button
            type="button"
            className="dashboard-control-button dashboard-theme-button dashboard-accent-purple"
            onClick={toggleTheme}
            aria-label={t(isDarkMode ? 'Switch to light mode' : 'Switch to dark mode')}
            title={t(isDarkMode ? 'Switch to light mode' : 'Switch to dark mode')}
          >
            {isDarkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={`dashboard-control-button dashboard-eye-care-button dashboard-accent-teal${isEyeCareMode ? ' is-active' : ''}`}
            onClick={toggleEyeCareMode}
            aria-label={t(isEyeCareMode ? 'Turn off eye care mode' : 'Switch to eye care mode')}
            title={t(isEyeCareMode ? 'Turn off eye care mode' : 'Switch to eye care mode')}
            aria-pressed={isEyeCareMode}
          >
            <Eye size={18} aria-hidden="true" />
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
        createPortal(
          <EditProfileModal profile={{ ...profile, full_name: getFullName(profile) || displayName }} onClose={closeModal} onSaved={handleProfileSaved} />,
          document.body
        )
      )}

      {modal === 'password' && (
        createPortal(
          <ChangePasswordModal
            error={modalError}
            onClose={closeModal}
            onSubmit={changePassword}
            passwordForm={passwordForm}
            setPasswordForm={setPasswordForm}
            success={modalSuccess}
          />,
          document.body
        )
      )}

      {modal === 'settings' && (
        createPortal(
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
                  <div className="dashboard-settings-options" role="group" aria-label={t('Appearance')}>
                    <button type="button" className={!isDarkMode && !isEyeCareMode ? 'active' : ''} aria-pressed={!isDarkMode && !isEyeCareMode} onClick={() => setThemeMode('light')}>
                      <Sun size={17} aria-hidden="true" /> {t('Light')}
                    </button>
                    <button type="button" className={isDarkMode ? 'active' : ''} aria-pressed={isDarkMode} onClick={() => setThemeMode('dark')}>
                      <Moon size={17} aria-hidden="true" /> {t('Dark')}
                    </button>
                    <button type="button" className={isEyeCareMode ? 'active' : ''} aria-pressed={isEyeCareMode} onClick={() => setThemeMode('eye-care')}>
                      <Eye size={17} aria-hidden="true" /> {t('Eye Care')}
                    </button>
                  </div>
                </fieldset>
              </div>
            </section>
          </div>,
          document.body
        )
      )}
    </>
  );
};

export default DashboardHeader;
