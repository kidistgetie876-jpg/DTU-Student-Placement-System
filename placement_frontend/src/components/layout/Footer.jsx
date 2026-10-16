import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';
import dtuLogo from '../../assets/image.png';
import './Footer.css';

const quickLinks = [
  { label: 'Home', path: '/' },
  { label: 'Placement Info', path: '/placement-info' },
  { label: 'Announcements', path: '/announcements' },
  { label: 'Contact', path: '/contact' },
  { label: 'Portal Login', path: '/login' },
];

function Footer() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-card footer-brand">
            <Link to="/" className="footer-brand-link">
              <img src={dtuLogo} alt="Debre Tabor University logo" className="footer-logo" />
              <span className="footer-brand-title">Debre Tabor University</span>
            </Link>
            <h2 className="footer-system-name">Student Department Placement System (SDPS)</h2>
            <p className="brand-desc">
              Connecting students with meaningful placement opportunities.
            </p>
          </div>

          <div className="footer-card footer-links">
            <h2 className="col-title">Quick Links</h2>
            <ul className="col-list">
              {quickLinks.map(({ label, path }) => (
                <li key={path}><Link to={path}>{label}</Link></li>
              ))}
            </ul>
          </div>

          <div className="footer-card footer-contact">
            <h2 className="col-title">Contact Info</h2>
            <ul className="contact-list">
              <li>
                <MapPin aria-hidden="true" />
                <span>Debre Tabor, Amhara Region, Ethiopia</span>
              </li>
              <li>
                <Mail aria-hidden="true" />
                <a href="mailto:placement@dtu.edu.et">placement@dtu.edu.et</a>
              </li>
              <li>
                <Phone aria-hidden="true" />
                <a href="tel:+251988024266">+251 988 024 266</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="copyright">© 2026 Debre Tabor University. All Rights Reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
