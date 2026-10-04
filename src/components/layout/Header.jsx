import React, { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import './Header.css';
import dtuLogo from '../../assets/image.png'; // ሎጎህ እዚህ መሆኑን አረጋግጥ
import api from '../../services/api.js';

const defaultPublicLinks = [
  { id: 'home', label: 'Home', path: '/', enabled: true },
  { id: 'services', label: 'Services', path: '/services', enabled: true },
  { id: 'placement-info', label: 'Placement Info', path: '/placement-info', enabled: true },
  { id: 'announcements', label: 'Announcements', path: '/announcements', enabled: true },
  { id: 'contact', label: 'Contact', path: '/contact', enabled: true },
];

function Header() {
  const getStoredUser = () => {
    const storedUser = localStorage.getItem('user');

    if (!storedUser) return null;

    try {
      const parsedUser = JSON.parse(storedUser);
      const hasUserData = parsedUser && typeof parsedUser === 'object' && (
        parsedUser.id !== undefined ||
        parsedUser.username !== undefined ||
        parsedUser.email !== undefined ||
        parsedUser.role !== undefined
      );

      return hasUserData ? parsedUser : null;
    } catch (error) {
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
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin') || 
                       location.pathname.startsWith('/registrar') || 
                       location.pathname.startsWith('/head');
  const isDashboardRoute = isAdminRoute || location.pathname.startsWith('/student-dashboard');

  useEffect(() => {
    setUser(getStoredUser());
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let isMounted = true;
    const loadSiteSettings = async () => {
      try {
        const response = await api.get('api/common/system_settings_api.php');
        if (!isMounted) return;
        const settings = response.data?.settings || {};
        setSiteBranding({
          universityTitle: settings.site?.universityTitle || 'DEBRE TABOR UNIVERSITY',
          systemSubtitle: settings.site?.systemSubtitle || 'Student Department Placement System',
        });
        setPublicLinks(Array.isArray(settings.navigation) ? settings.navigation : defaultPublicLinks);
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
      if (event.key === 'user') {
        setUser(getStoredUser());
      }
    };

    window.addEventListener('storage', syncUser);
    return () => window.removeEventListener('storage', syncUser);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    navigate('/login');
  };

  const isAuthenticated = user !== null;

  return (
    <header className="main-header-container">
      {/* TIER 1: University Branding (Sefa yalena Blue) */}
      <div className="top-branding-tier">
        <div className="container d-flex align-items-center">
          <Link to="/" className="d-flex align-items-center text-decoration-none">
            <img src={dtuLogo} alt="DTU Logo" className="university-logo" />
            <div className="brand-text-wrapper ms-3">
              <h1 className="university-name">{siteBranding.universityTitle}</h1>
              <p className="system-subtitle">{siteBranding.systemSubtitle}</p>
            </div>
          </Link>
        </div>
      </div>

      {/* TIER 2: Navigation (Tebeb yalena Professional) */}
      <nav className="navbar navbar-expand-lg navigation-tier">
        <div className="container position-relative">
          
          {/* Mobile Toggle */}
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

          <div className={`collapse navbar-collapse ${isMenuOpen ? 'show' : ''}`} id="dtuNavbar">
            {/* Center Links (Home, Services, Contact) */}
            {!isAdminRoute && (
              <ul className="navbar-nav mx-auto mb-2 mb-lg-0">
                {publicLinks.filter((link) => link.enabled === true).map((link) => (
                  <li className="nav-item" key={link.id}>
                    <NavLink to={link.path} end={link.path === '/'} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}

            {/* Top Right Action Button */}
            <div className="auth-action-wrapper ms-auto">
              {isAuthenticated && isDashboardRoute ? (
                <div className="d-flex align-items-center gap-3">
                  {user.role === 'admin' && <Link to="/admin-dashboard" className="dashboard-link">Dashboard</Link>}
                  <button onClick={handleLogout} className="btn btn-logout-custom">Logout</button>
                </div>
              ) : (
                <Link to="/login" className="btn btn-login-custom">Login</Link>
              )}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}

export default Header;