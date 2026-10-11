import React, { useEffect, useState } from 'react';
import {
  FiArrowUpRight,
  FiClock,
  FiGlobe,
  FiMail,
  FiMapPin,
  FiPhone,
  FiRefreshCw,
  FiSend,
} from 'react-icons/fi';
import api from '../../services/api.js';
import './Contact.css';

const defaultContactInfo = {
  location: 'Registrar Office, Ground Floor, Main Campus, Debre Tabor, Ethiopia',
  phone1: '+251 988024266',
  phone2: '+251 995015403',
  supportEmail: 'placement@dtu.edu.et',
  officeHours: 'Monday - Friday: 8:30 AM - 5:30 PM (Local Time)',
};

const Contact = () => {
  const [contactInfo, setContactInfo] = useState(defaultContactInfo);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadContactSettings = async () => {
      try {
        const response = await api.get('api/common/system_settings_api.php');
        if (isMounted && response.data?.settings?.contact) {
          setContactInfo((current) => ({ ...current, ...response.data.settings.contact }));
        }
      } catch (error) {
        if (isMounted) {
          console.error('Unable to load contact settings; using the default contact information.', error);
        }
      }
    };

    loadContactSettings();
    window.addEventListener('system-settings-updated', loadContactSettings);
    return () => {
      isMounted = false;
      window.removeEventListener('system-settings-updated', loadContactSettings);
    };
  }, []);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (status.message) setStatus({ type: '', message: '' });
  };

  const resetForm = () => {
    setForm({ name: '', email: '', subject: '', message: '' });
    setStatus({ type: '', message: '' });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ type: '', message: '' });
    setSending(true);

    try {
      const response = await api.post('api/common/contact_api.php', {
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to send your message. Please try again.');
      }

      setStatus({
        type: 'success',
        message: response.data.message || 'Thank you! Your message has been sent to the Placement Office.',
      });
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error.response?.data?.message || error.message || 'Unable to send your message. Please try again.',
      });
    } finally {
      setSending(false);
    }
  };

  const phones = [contactInfo.phone1, contactInfo.phone2].filter(Boolean);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contactInfo.location)}`;

  const contactCards = [
    {
      icon: FiMapPin,
      label: 'Visit our office',
      content: contactInfo.location,
      href: mapUrl,
    },
    {
      icon: FiMail,
      label: 'Email support',
      content: contactInfo.supportEmail,
      href: `mailto:${contactInfo.supportEmail}`,
    },
    {
      icon: FiPhone,
      label: 'Call the office',
      content: phones.join(' / '),
      href: phones[0] ? `tel:${phones[0].replace(/[^\d+]/g, '')}` : undefined,
    },
    {
      icon: FiClock,
      label: 'Office hours',
      content: contactInfo.officeHours || defaultContactInfo.officeHours,
    },
  ];

  return (
    <main className="contact-page">
      <div className="contact-shell">
        <section className="contact-intro" aria-labelledby="contact-heading">
          <div className="contact-eyebrow"><FiGlobe aria-hidden="true" /> Debre Tabor University</div>
          <h1 id="contact-heading">Let’s talk about your next step.</h1>
          <p>
            Questions about department placement? Send a message to the Placement Office and our team will help you find the right answer.
          </p>
        </section>

        <div className="contact-layout">
          <aside className="contact-sidebar" aria-labelledby="contact-info-heading">
            <div>
              <span className="contact-section-kicker">We’re here to help</span>
              <h2 id="contact-info-heading">Contact information</h2>
              <p className="contact-sidebar-copy">
                Reach out to the Registrar and Placement Office using any of the options below.
              </p>

              <div className="contact-info-list">
                {contactCards.map(({ icon: Icon, label, content, href }) => (
                  <div className="contact-info-item" key={label}>
                    <span className="contact-info-icon"><Icon aria-hidden="true" /></span>
                    <div className="contact-info-text">
                      <span className="contact-info-label">{label}</span>
                      {href ? (
                        <a href={href} target={href.startsWith('https://') ? '_blank' : undefined} rel={href.startsWith('https://') ? 'noreferrer' : undefined}>
                          {content}
                        </a>
                      ) : (
                        <span>{content || 'Contact details are not available'}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <a className="contact-directions" href={mapUrl} target="_blank" rel="noreferrer">
              <span className="contact-directions-icon"><FiMapPin aria-hidden="true" /></span>
              <span>
                <strong>Find us on the map</strong>
                <small>Open directions to the university</small>
              </span>
              <FiArrowUpRight className="contact-directions-arrow" aria-hidden="true" />
            </a>
          </aside>

          <section className="contact-form-panel" aria-labelledby="contact-form-heading">
            <div className="contact-form-heading">
              <span className="contact-section-kicker">Send us a message</span>
              <h2 id="contact-form-heading">How can we help?</h2>
              <p>Complete the form and your message will go directly to the Placement Office.</p>
            </div>

            {status.message && (
              <div className={`contact-status contact-status-${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>
                <span className="contact-status-mark" aria-hidden="true">{status.type === 'success' ? '✓' : '!'}</span>
                <span>{status.message}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="contact-form-grid">
                <div className="contact-field">
                  <label htmlFor="contact-name">Full name <span aria-hidden="true">*</span></label>
                  <input
                    id="contact-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    maxLength={255}
                    placeholder="Your name"
                    value={form.name}
                    onChange={updateField}
                    required
                  />
                </div>
                <div className="contact-field">
                  <label htmlFor="contact-email">Email address <span aria-hidden="true">*</span></label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={255}
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={updateField}
                    required
                  />
                </div>
                <div className="contact-field contact-field-wide">
                  <label htmlFor="contact-subject">Subject</label>
                  <input
                    id="contact-subject"
                    name="subject"
                    type="text"
                    maxLength={255}
                    placeholder="What is your message about?"
                    value={form.subject}
                    onChange={updateField}
                  />
                </div>
                <div className="contact-field contact-field-wide">
                  <label htmlFor="contact-message">Message <span aria-hidden="true">*</span></label>
                  <textarea
                    id="contact-message"
                    name="message"
                    rows={5}
                    placeholder="Tell us how we can help..."
                    value={form.message}
                    onChange={updateField}
                    required
                  />
                </div>
              </div>

              <div className="contact-form-actions">
                <button className="contact-reset-button" type="button" onClick={resetForm} disabled={sending}>
                  <FiRefreshCw aria-hidden="true" /> Clear form
                </button>
                <button className="contact-submit-button" type="submit" disabled={sending}>
                  {sending ? 'Sending message…' : 'Send message'}
                  {!sending && <FiSend aria-hidden="true" />}
                </button>
              </div>
            </form>
          </section>
        </div>

        <footer className="contact-page-footer">
          © {new Date().getFullYear()} Debre Tabor University · Student Department Placement System
        </footer>
      </div>
    </main>
  );
};

export default Contact;
