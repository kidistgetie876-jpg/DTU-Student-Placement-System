import React, { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import './Header.css';
import dtuLogo from '../../assets/image.png'; // ሎጎህ እዚህ መሆኑን አረጋግጥ
import api from '../../services/api.js';
import DashboardHeader from './DashboardHeader.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

const defaultPublicLinks = [
  { id: 'home', label: 'Home', path: '/', enabled: true },
  { id: 'services', label: 'Services', path: '/services', enabled: true },
  { id: 'placement-info', label: 'Placement Info', path: '/placement-info', enabled: true },
  { id: 'announcements', label: 'Announcements', path: '/announcements', enabled: true },
  { id: 'contact', label: 'Contact', path: '/contact', enabled: true },
];

const mergePublicLinks = (navigation) => defaultPublicLinks.map((defaultLink) => {
  const savedLink = navigation.find((link) => link?.id === defaultLink.id);
  return { ...defaultLink, ...(savedLink || {}), path: defaultLink.path };
});

function Header() {
  const getStoredUser = () => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return null;
    try {
      const parsedUser = JSON.parse(storedUser);
      return parsedUser && typeof parsedUser === 'object' ? parsedUser : null;
    } catch {
      return null;
    }
  };

  const [user, setUser] = useState(() => getStoredUser());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [siteBranding, setSiteBranding] = useState({
    universityTitle: 'DEBRE TABOR UNIVERSITY',
    systemSubtitle: 'Student Department Placement System',
  });
  const [publicLinks, setPublicLinks] = useState(defaultPublicLinks);
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin') || 
                       location.pathname.startsWith('/registrar') || 
                       location.pathname.startsWith('/head');
  const isDashboardRoute = isAdminRoute || location.pathname.startsWith('/student-dashboard');
  const hasDashboardHeader = /^\/(admin-dashboard|registrar-dashboard|head-dashboard|student-dashboard)(\/|$)/.test(location.pathname);

  useEffect(() => {
    setUser(getStoredUser());
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let isMounted = true;
    const loadSiteSettings = async () => {
      if (!api || typeof api.get !== 'function') return;
      try {
        const response = await Promise.resolve(api.get('api/common/system_settings_api.php'));
        if (!response?.data) return;
        if (!isMounted) return;
        const settings = response.data?.settings || {};
        setSiteBranding({
          universityTitle: settings.site?.universityTitle || 'DEBRE TABOR UNIVERSITY',
          systemSubtitle: settings.site?.systemSubtitle || 'Student Department Placement System',
        });
        setPublicLinks(mergePublicLinks(Array.isArray(settings.navigation) ? settings.navigation : []));
      } catch (error) {
        // Keep the default public navigation available when settings are unreachable.
      }
    };

    loadSiteSettings();
    window.addEventListener('system-settings-updated', loadSiteSettings);
    return () => {
      isMounted = false;
      window.removeEventListener('system-settings-updated', loadSiteSettings);
    };
  }, []);

  useEffect(() => {
    const syncUser = (event) => {
      if (event.key === 'user') setUser(getStoredUser());
    };
    const syncProfile = () => setUser(getStoredUser());
    window.addEventListener('storage', syncUser);
    window.addEventListener('user-profile-updated', syncProfile);
    return () => {
      window.removeEventListener('storage', syncUser);
      window.removeEventListener('user-profile-updated', syncProfile);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    sessionStorage.removeItem('registrarActiveTab');
    ['token', 'accessToken', 'authToken'].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    window.dispatchEvent(new Event('user-logged-out'));
    setUser(null);
    navigate('/', { replace: true });
    Promise.resolve(api.post('auth/logout.php')).catch((error) => {
      console.error('Unable to invalidate the server login session:', error);
    });
  };

  const isAuthenticated = user !== null;

  return (
    <header className="main-header-container">
      {/* TIER 1: University Branding (Sefa yalena Blue) */}
      <div className={`top-branding-tier${hasDashboardHeader ? ' has-dashboard-utilities' : ''}`}>
        <div className="container top-branding-content">
          <Link to="/" className="d-flex align-items-center text-decoration-none">
            <img src={dtuLogo} alt="DTU Logo" className="university-logo" />
            <div className="brand-text-wrapper ms-3">
              <h1 className="university-name">{t(siteBranding.universityTitle)}</h1>
              <p className="system-subtitle">{t(siteBranding.systemSubtitle)}</p>
            </div>
          </Link>
          {hasDashboardHeader && (
            <DashboardHeader
              variant="navigation"
              role={user?.role}
            />
          )}
        </div>
      </div>

      {!hasDashboardHeader && (

        /* TIER 2: Public navigation (Tebeb yalena Professional) */
        <nav className="navbar navbar-expand-lg navigation-tier">
          <div className="container position-relative">
          
            {/* Mobile Toggle */}
            {!isDashboardRoute && (
              <button
                className="navbar-toggler"
                type="button"
                aria-controls="dtuNavbar"
                aria-expanded={isMenuOpen}
                aria-label="Toggle navigation"
                onClick={() => setIsMenuOpen((open) => !open)}
              >
                <span className="navbar-toggler-icon"></span>
              </button>
            )}

            <div className={`collapse navbar-collapse ${isDashboardRoute || isMenuOpen ? 'show' : ''}`} id="dtuNavbar">
              {/* Center Links (Home, Services, Contact) */}
              {!isDashboardRoute && (
                <ul className="navbar-nav mx-auto mb-2 mb-lg-0">
                  {publicLinks.filter((link) => link.enabled === true).map((link) => (
                    <li className="nav-item" key={link.id}>
                      <NavLink to={link.path} end={link.path === '/'} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                        {t(link.label)}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}

              {!hasDashboardHeader && (
                <div className="auth-action-wrapper ms-auto d-flex align-items-center gap-3">
                  <label className="visually-hidden" htmlFor="site-language-select">{t('Select language')}</label>
                  <select
                    id="site-language-select"
                    className="form-select form-select-sm w-auto"
                    aria-label={t('Select language')}
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="am">አማርኛ</option>
                  </select>
                  {isAuthenticated && isDashboardRoute ? (
                    <div className="d-flex align-items-center gap-3">
                      {user.role === 'admin' && <Link to="/admin-dashboard" className="dashboard-link">{t('Dashboard')}</Link>}
                      <button onClick={handleLogout} className="btn btn-logout-custom">{t('Logout')}</button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-login-custom" onClick={() => navigate('/login')}>
                      {t('Login')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

export default Header;