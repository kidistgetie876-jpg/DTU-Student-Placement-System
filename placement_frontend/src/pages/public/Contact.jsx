import React, { useEffect, useState } from 'react';
import api from '../../services/api.js';
import { FiMail as Mail, FiPhone as Phone, FiMapPin as MapPin, FiClock as Clock, FiSend as Send, FiRefreshCcw as RefreshCcw, FiGlobe as Globe } from 'react-icons/fi';

const Contact = () => {
  const [contactInfo, setContactInfo] = useState({
    location: 'Registrar Office, Ground Floor, Main Campus, Debre Tabor, Ethiopia',
    phone1: '+251 988024266',
    phone2: '+251 995015403',
    supportEmail: 'placement@dtu.edu.et',
    officeHours: 'Monday - Friday: 8:30 AM - 5:30 PM (Local Time)',
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
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
      } catch {
      }
    };

    loadContactSettings();
    window.addEventListener('system-settings-updated', loadContactSettings);

    return () => {
      isMounted = false;
      window.removeEventListener('system-settings-updated', loadContactSettings);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: '', message: '' });
    
    if (!name || !email || !message) {
      setStatus({ type: 'error', message: 'Please fill all required fields.' });
      return;
    }

    setSending(true);
    const payload = { name, email, subject, message, date: new Date().toISOString() };

    try {
      await api.post('api/common/contact_api.php', payload);
      setStatus({ type: 'success', message: 'Thank you! Your message has been sent to the Placement Office.' });
      setName(''); setEmail(''); setSubject(''); setMessage('');
    } catch (err) {
      try {
        const stored = JSON.parse(localStorage.getItem('contact_messages') || '[]');
        stored.push(payload);
        localStorage.setItem('contact_messages', JSON.stringify(stored));
        setStatus({ type: 'success', message: 'Message saved locally. It will be sent once the server is back online.' });
        setName(''); setEmail(''); setSubject(''); setMessage('');
      } catch (saveErr) {
        setStatus({ type: 'error', message: 'Something went wrong. Please try again later.' });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="text-center mb-5">
        <h2 className="fw-bold text-primary">Get In Touch</h2>
        <p className="text-muted mx-auto" style={{ maxWidth: '600px' }}>
          Have questions about the student placement process? Our team is here to help you with technical support and inquiries.
        </p>
      </div>

      <div className="row g-0 shadow-lg border-0" style={{ borderRadius: '20px', overflow: 'hidden' }}>
        {/* Left Side: Contact Information */}
        <div className="col-lg-5 bg-primary p-5 text-white d-flex flex-column justify-content-between">
          <div>
            <h3 className="fw-bold mb-4">Contact Information</h3>
            <p className="text-white-50 mb-5">Fill out the form and our team will get back to you within 24 hours.</p>

            <div className="d-flex align-items-start mb-4">
              <div className="bg-white bg-opacity-25 p-3 rounded-3 me-3">
                <MapPin size={24} />
              </div>
              <div>
                <div className="fw-bold">Location</div>
                <div className="small text-white-50">{contactInfo.location}</div>
              </div>
            </div>

            <div className="d-flex align-items-start mb-4">
              <div className="bg-white bg-opacity-25 p-3 rounded-3 me-3">
                <Phone size={24} />
              </div>
              <div>
                <div className="fw-bold">Phone</div>
                <div className="small text-white-50">{[contactInfo.phone1, contactInfo.phone2].filter(Boolean).join(' / ')}</div>
              </div>
            </div>

            <div className="d-flex align-items-start mb-4">
              <div className="bg-white bg-opacity-25 p-3 rounded-3 me-3">
                <Mail size={24} />
              </div>
              <div>
                <div className="fw-bold">Email</div>
                <a className="small text-white-50" href={`mailto:${contactInfo.supportEmail}`}>{contactInfo.supportEmail}</a>
              </div>
            </div>

            <div className="d-flex align-items-start mb-4">
              <div className="bg-white bg-opacity-25 p-3 rounded-3 me-3">
                <Clock size={24} />
              </div>
              <div>
                <div className="fw-bold">Office Hours</div>
                <div className="small text-white-50">{contactInfo.officeHours || 'Monday - Friday: 8:30 AM - 5:30 PM (Local Time)'}</div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="d-flex gap-3">
               <a href="https://www.dtu.edu.et" target="_blank" rel="noreferrer" className="text-white text-decoration-none small d-flex align-items-center">
                 <Globe size={16} className="me-1"/> www.dtu.edu.et
               </a>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="col-lg-7 bg-white p-5">
          <h4 className="fw-bold mb-4 text-dark">Send a Message</h4>
          
          {status.message && (
            <div className={`alert ${status.type === 'success' ? 'alert-success border-0' : 'alert-danger border-0'} fade show shadow-sm d-flex align-items-center`} role="alert">
              <div className="me-2">{status.type === 'success' ? '✅' : '❌'}</div>
              {status.message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4">
            <div className="row g-4">
              <div className="col-md-6">
                <label className="form-label fw-semibold small">Full Name</label>
                <input 
                  className="form-control form-control-lg bg-light border-0 fs-6" 
                  placeholder="Enter your name"
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  required 
                />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold small">Email Address</label>
                <input 
                  type="email" 
                  className="form-control form-control-lg bg-light border-0 fs-6" 
                  placeholder="yourname@example.com"
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small">Subject</label>
                <input 
                  className="form-control form-control-lg bg-light border-0 fs-6" 
                  placeholder="e.g. Placement Appeal Support"
                  value={subject} 
                  onChange={e => setSubject(e.target.value)} 
                />
              </div>
              <div className="col-12">
                <label className="form-label fw-semibold small">How can we help?</label>
                <textarea 
                  className="form-control form-control-lg bg-light border-0 fs-6" 
                  rows={5} 
                  placeholder="Write your message here..."
                  value={message} 
                  onChange={e => setMessage(e.target.value)} 
                  required 
                />
              </div>
              <div className="col-12 d-flex justify-content-between align-items-center mt-4">
                <button 
                  className="btn btn-link text-muted text-decoration-none d-flex align-items-center p-0" 
                  type="reset" 
                  onClick={() => { setName(''); setEmail(''); setSubject(''); setMessage(''); setStatus({ type:'', message:'' }); }}
                >
                  <RefreshCcw size={16} className="me-2"/> Reset Form
                </button>
                <button 
                  className="btn btn-primary btn-lg px-5 py-3 rounded-pill shadow-sm d-flex align-items-center" 
                  disabled={sending}
                >
                  {sending ? 'Sending...' : (
                    <>
                      Send Message <Send size={18} className="ms-2" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      
      {/* Footer Info */}
      <div className="mt-5 text-center text-muted small">
        <p>© {new Date().getFullYear()} Debre Tabor University - Student Department Placement System</p>
      </div>
    </div>
  );
};

export default Contact;