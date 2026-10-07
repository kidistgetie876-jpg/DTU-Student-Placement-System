import React, { useState, useEffect } from 'react';
import api from '../../services/api.js';
import { FiEye, FiEyeOff } from 'react-icons/fi';

const AdminAccount = () => {
  const [admin, setAdmin] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '', currentPassword: '', newPassword: '', confirmPassword: '' });
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({ current: false, new: false, confirm: false });

  const togglePassword = (field) => {
    setVisiblePasswords((previous) => ({ ...previous, [field]: !previous[field] }));
  };

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
      setAdmin(user);
      setFormData(prev => ({ ...prev, username: user.username || '', email: user.email || '' }));
    }
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setMsg({ text: '', type: '' });

    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      setMsg({ text: 'አዲሱ ፓስወርድ ከማረጋገጫው ጋር አልተገጣጠመም!', type: 'danger' });
      return;
    }
    if (!formData.currentPassword) {
      setMsg({ text: 'የአሁኑን password ያስገቡ።', type: 'danger' });
      return;
    }

    setLoading(true);
    try {
      const userId = admin.id || admin.user_id;
      const res = await api.put(`api/admin/users_api.php?id=${encodeURIComponent(userId)}`, {
        username: formData.username,
        email: formData.email,
        current_password: formData.currentPassword,
        new_password: formData.newPassword
      });

      if (res.data.success) {
        setMsg({ text: 'መረጃው በትክክል ተቀይሯል!', type: 'success' });
        localStorage.setItem('user', JSON.stringify({ ...admin, username: formData.username, email: formData.email }));
        setIsEditing(false);
        setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
        setVisiblePasswords({ current: false, new: false, confirm: false });
      } else {
        setMsg({ text: res.data.message, type: 'danger' });
      }
    } catch (err) {
      setMsg({ text: err.response?.data?.message || 'የሰርቨር ስህተት አጋጥሟል።', type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  if (!admin) return <div className="text-center p-5">Loading...</div>;

  return (
    <div className="container py-4">
      <div className="card shadow-sm border-0 rounded-4" style={{maxWidth: '600px', margin: '0 auto'}}>
        <div className="card-header bg-primary text-white p-4">
          <h4 className="mb-0 fw-bold">Admin Account Settings</h4>
          <p className="small mb-0 opacity-75">አካውንቱን ለሌላ ሰው ለማስረከብ ወይም መረጃዎን ለመቀየር እዚህ ይጠቀሙ።</p>
        </div>
        <div className="card-body p-4">
          {msg.text && <div className={`alert alert-${msg.type} small`}>{msg.text}</div>}
          
          <form onSubmit={handleSave}>
            <div className="mb-3">
              <label className="form-label small fw-bold">Username</label>
              <input type="text" className="form-control" value={formData.username} 
                onChange={(e) => setFormData({...formData, username: e.target.value})} required disabled={!isEditing} />
            </div>
            <div className="mb-3">
              <label className="form-label small fw-bold">Email Address</label>
              <input type="email" className="form-control" value={formData.email} 
                onChange={(e) => setFormData({...formData, email: e.target.value})} required disabled={!isEditing} />
            </div>

            {isEditing && (
              <div className="bg-light p-3 rounded-3 mb-3 border">
                <div className="mb-3">
                  <label className="form-label small fw-bold">Current Password</label>
                  <div className="input-group mb-3">
                    <input type={visiblePasswords.current ? 'text' : 'password'} className="form-control shadow-sm" autoComplete="current-password" value={formData.currentPassword}
                      onChange={(e) => setFormData({...formData, currentPassword: e.target.value})} required />
                    <button type="button" className="btn btn-outline-secondary" aria-label={visiblePasswords.current ? 'Hide current password' : 'Show current password'} onClick={() => togglePassword('current')}>
                      {visiblePasswords.current ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                  <label className="form-label small fw-bold">New Password (Optional)</label>
                  <div className="input-group">
                    <input type={visiblePasswords.new ? 'text' : 'password'} className="form-control shadow-sm" autoComplete="new-password" value={formData.newPassword}
                      onChange={(e) => setFormData({...formData, newPassword: e.target.value})} />
                    <button type="button" className="btn btn-outline-secondary" aria-label={visiblePasswords.new ? 'Hide new password' : 'Show new password'} onClick={() => togglePassword('new')}>
                      {visiblePasswords.new ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="form-label small fw-bold">Confirm New Password</label>
                  <div className="input-group">
                    <input type={visiblePasswords.confirm ? 'text' : 'password'} className="form-control shadow-sm" autoComplete="new-password" value={formData.confirmPassword}
                      onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} />
                    <button type="button" className="btn btn-outline-secondary" aria-label={visiblePasswords.confirm ? 'Hide confirm password' : 'Show confirm password'} onClick={() => togglePassword('confirm')}>
                      {visiblePasswords.confirm ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="d-flex gap-2">
              {!isEditing ? (
                <button type="button" className="btn btn-primary px-4" onClick={() => setIsEditing(true)}>Edit Profile</button>
              ) : (
                <>
                  <button type="submit" className="btn btn-success px-4" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
                  <button type="button" className="btn btn-light border" onClick={() => { setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' })); setVisiblePasswords({ current: false, new: false, confirm: false }); setIsEditing(false); }}>Cancel</button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminAccount;