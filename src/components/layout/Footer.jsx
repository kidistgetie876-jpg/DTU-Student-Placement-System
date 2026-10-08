import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaTwitter, FaFacebookF, FaLinkedinIn, FaEnvelope } from 'react-icons/fa';
import api from '../../services/api.js';
import './Footer.css';

function Footer() {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [newsStatus, setNewsStatus] = useState('');
  const [footerText, setFooterText] = useState('Connecting students, departments, and employers through a transparent and efficient placement experience.');

  useEffect(() => {
    let isMounted = true;
    const loadFooterSettings = async () => {
      try {
        const response = await api.get('api/common/system_settings_api.php');
        const settings = response.data?.settings || response.data?.data?.settings || response.data?.data || response.data || {};
        let homepage = settings.public_portal || settings.homepage || settings;
        if (typeof homepage === 'string') {
          try {
            homepage = JSON.parse(homepage);
          } catch {
            homepage = {};
          }
        }

        const savedFooterText = homepage?.footerText;
        if (isMounted && typeof savedFooterText === 'string' && savedFooterText.trim()) {
          setFooterText(savedFooterText.trim());
        }
      } catch {
      }
    };

    loadFooterSettings();
    window.addEventListener('system-settings-updated', loadFooterSettings);
    return () => {
      isMounted = false;
      window.removeEventListener('system-settings-updated', loadFooterSettings);
    };
  }, []);

  let storedUser = null;
  try {
    storedUser = JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    storedUser = null;
  }
  const dashboardRoutes = {
    admin: '/admin-dashboard',
    registrar: '/registrar-dashboard',
    head: '/head-dashboard',
    student: '/student-dashboard',
  };
  const dashboardPath = storedUser && typeof storedUser === 'object'
    ? dashboardRoutes[String(storedUser.role || '').trim().toLowerCase()]
    : null;

  const subscribe = (e) => {
    e.preventDefault();
    const normalizedEmail = newsletterEmail.trim();
    if (!e.currentTarget.checkValidity()) {
      e.currentTarget.reportValidity();
      return;
    }
    if (!normalizedEmail) {
      setNewsStatus('Please enter a valid email.');
      return;
    }
    try {
      const list = JSON.parse(localStorage.getItem('newsletter_signups') || '[]');
      list.push({ email: normalizedEmail, date: new Date().toISOString() });
      localStorage.setItem('newsletter_signups', JSON.stringify(list));
      setNewsletterEmail('');
      setSubscribed(true);
      setNewsStatus('');
    } catch {
      setSubscribed(false);
      setNewsStatus('Unable to save your subscription. Please try again.');
    }
  };

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="footer-inner container">
        <div className="footer-grid">
          <div className="footer-col footer-brand">
            <div className="brand-header">
              <span className="brand-mark">DTU</span>
              <Link to="/" className="brand-link">DTU Placement</Link>
            </div>
            <p className="brand-desc">{footerText || 'Connecting students, departments, and employers through a transparent and efficient placement experience.'}</p>

            <div className="social-row" aria-label="Social media links">
              <a href="mailto:tsegayaaderajew021@gmail.com" target="_blank" rel="noopener noreferrer" aria-label="Email" className="social-btn"><FaEnvelope /></a>
              <a href="https://twitter.com/DebreTaborUniv" target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="social-btn"><FaTwitter /></a>
              <a href="https://www.facebook.com/DebreTaborUniversityOfficial" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="social-btn"><FaFacebookF /></a>
              <a href="https://www.linkedin.com/school/debre-tabor-university" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="social-btn"><FaLinkedinIn /></a>
            </div>
          </div>

          <div className="footer-col">
            <h6 className="col-title">Explore</h6>
            <ul className="col-list">
              <li><Link to="/">Home</Link></li>
              <li><Link to="/services">Services</Link></li>
              <li><Link to="/contact">Contact</Link></li>
              <li><Link to="/student-dashboard">Student Dashboard</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h6 className="col-title">Support</h6>
            <ul className="col-list">
              <li><Link to="/placement-info">Help Center</Link></li>
              <li><Link to="/contact">Request Info</Link></li>
              <li><Link to={dashboardPath || '/login'}>{dashboardPath ? 'My Dashboard' : 'Sign in'}</Link></li>
            </ul>
          </div>

          <div className="footer-col footer-newsletter">
            <h6 className="col-title">Newsletter</h6>
            <p className="small muted">Get placement news, workshops, and recruitment updates.</p>
            <form className="newsletter-form" onSubmit={subscribe}>
              <label htmlFor="newsletter-email" className="visually-hidden">Email address</label>
              <input id="newsletter-email" type="email" required placeholder="you@university.edu" value={newsletterEmail} onChange={e => { setNewsletterEmail(e.target.value); setSubscribed(false); setNewsStatus(''); }} />
              <button className="subscribe-btn" type="submit">Subscribe</button>
            </form>
            {subscribed && <div className="news-status news-status-success small" role="status">✓ Subscribed to placement updates!</div>}
            {!subscribed && newsStatus && <div className="news-status small" role="alert">{newsStatus}</div>}
          </div>
        </div>

        <div className="footer-bottom d-flex justify-content-between align-items-center flex-wrap gap-2 py-3 border-top border-secondary border-opacity-25">
          <div className="text-white-50 small">
            <span>© {new Date().getFullYear()} DEBRE TABOR UNIVERSITY. All rights reserved.</span>
          </div>
          <div className="d-flex align-items-center gap-3 text-white-50 small">
            <span className="fw-bold" style={{ color: '#f4c95d', letterSpacing: '0.03em' }}>
              Developed by MAU 4th Year CS Students
            </span>
            <span className="opacity-50">|</span>
            <span style={{ cursor: 'pointer' }}>Privacy</span>
            <span style={{ cursor: 'pointer' }}>Terms</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
