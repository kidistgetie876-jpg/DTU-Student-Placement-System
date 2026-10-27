import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';
import dtuLogo from '../../assets/image.png';

const quickLinks = [
  { label: 'Home', path: '/' },
  { label: 'Placement Info', path: '/placement-info' },
  { label: 'Announcements', path: '/announcements' },
  { label: 'Contact', path: '/contact' },
  { label: 'Portal Login', path: '/login' },
];

function Footer() {
  return (
    <footer className="site-footer border-t border-slate-800 bg-slate-900 px-6 py-4 text-sm text-slate-400" role="contentinfo">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <section aria-labelledby="footer-brand-heading">
            <Link to="/" className="mb-3 inline-flex items-center gap-3 text-white no-underline transition-colors duration-200 hover:text-indigo-300">
              <img
                src={dtuLogo}
                alt="Debre Tabor University logo"
                className="h-12 w-12 rounded-full bg-white object-contain"
              />
              <span id="footer-brand-heading" className="text-xl font-bold text-white">
                Debre Tabor University
              </span>
            </Link>
            <p className="mb-2 text-sm font-semibold text-slate-200">
              Student Department Placement System (SDPS)
            </p>
            <p className="max-w-sm text-sm leading-relaxed text-slate-400">
              Connecting students with meaningful placement opportunities.
            </p>
          </section>

          <nav aria-labelledby="footer-links-heading">
            <h2 id="footer-links-heading" className="mb-4 text-base font-semibold text-white">
              Quick Links
            </h2>
            <ul className="list-none space-y-2.5 p-0">
              {quickLinks.map(({ label, path }) => (
                <li key={path}>
                  <Link
                    to={path}
                    className="inline-flex text-sm text-slate-300 no-underline transition-all duration-200 hover:translate-x-1 hover:text-indigo-400 focus-visible:text-indigo-400 focus-visible:outline-none"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-labelledby="footer-contact-heading">
            <h2 id="footer-contact-heading" className="mb-4 text-base font-semibold text-white">
              Contact Info
            </h2>
            <ul className="list-none space-y-3 p-0">
              <li className="flex items-center gap-3 text-sm text-slate-300">
                <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-300" />
                <span>Debre Tabor, Amhara Region, Ethiopia</span>
              </li>
              <li className="flex items-center gap-3 text-sm text-slate-300">
                <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-300" />
                <a className="text-inherit no-underline transition-colors duration-200 hover:text-indigo-400" href="mailto:placement@dtu.edu.et">
                  placement@dtu.edu.et
                </a>
              </li>
              <li className="flex items-center gap-3 text-sm text-slate-300">
                <Phone aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-300" />
                <a className="text-inherit no-underline transition-colors duration-200 hover:text-indigo-400" href="tel:+251988024266">
                  +251 988 024 266
                </a>
              </li>
            </ul>
          </section>
        </div>

        <div className="my-8 border-t border-slate-800 pt-6">
          <p className="m-0 text-center text-xs text-slate-500">
            © 2026 Debre Tabor University. All Rights Reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
