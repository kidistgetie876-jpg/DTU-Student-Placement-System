import React, { useState, useEffect } from 'react';
import api from '../../services/api.js';
import PasswordInput from '../../components/layout/PasswordInput.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import './AdminAccount.css';

const AdminAccount = () => {
  const { t } = useLanguage();
  const [admin, setAdmin] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '', currentPassword: '', newPassword: '', confirmPassword: '' });
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
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
    <div className="admin-account-page container py-4">
      <div className="admin-account-card card">
        <div className="admin-account-header card-header">
          <h4 className="mb-0 fw-bold">{t('Admin Account Settings')}</h4>
          <p className="small mb-0 mt-2 opacity-75">{t('Update your account details and password.')}</p>
        </div>
        <div className="admin-account-body card-body">
          {msg.text && <div className={`alert alert-${msg.type} small`}>{msg.text}</div>}
          
          <form onSubmit={handleSave}>
            <div className="mb-3">
              <label className="admin-account-label form-label" htmlFor="admin-account-username">{t('Username')}</label>
              <input id="admin-account-username" type="text" className="admin-account-input form-control" value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})} required disabled={!isEditing} />
            </div>
            <div className="mb-3">
              <label className="admin-account-label form-label" htmlFor="admin-account-email">{t('Email Address')}</label>
              <input id="admin-account-email" type="email" className="admin-account-input form-control" value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})} required disabled={!isEditing} />
            </div>

            {isEditing && (
              <div className="admin-account-password-section p-4 rounded-3 mb-4 border">
                <div className="mb-3">
                  <label className="admin-account-label form-label">{t('Current Password')}</label>
                  <PasswordInput className="mb-3" inputClassName="admin-account-input form-control" autoComplete="current-password" label="current password" value={formData.currentPassword}
                    onChange={(e) => setFormData({...formData, currentPassword: e.target.value})} required />
                  <label className="admin-account-label form-label">{t('New Password (Optional)')}</label>
                  <PasswordInput className="mb-3" inputClassName="admin-account-input form-control" autoComplete="new-password" label="new password" value={formData.newPassword}
                    onChange={(e) => setFormData({...formData, newPassword: e.target.value})} />
                </div>
                <div>
                  <label className="admin-account-label form-label">{t('Confirm New Password')}</label>
                  <PasswordInput inputClassName="admin-account-input form-control" autoComplete="new-password" label="confirm password" value={formData.confirmPassword}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} />
                </div>
              </div>
            )}

            <div className="d-flex gap-2">
              {!isEditing ? (
                <button type="button" className="admin-account-primary-button btn" onClick={() => setIsEditing(true)}>{t('Edit Profile')}</button>
              ) : (
                <>
                  <button type="submit" className="admin-account-primary-button btn" disabled={loading}>{loading ? t('Saving...') : t('Save Changes')}</button>
                  <button type="button" className="admin-account-cancel-button btn" onClick={() => { setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' })); setIsEditing(false); }}>{t('Cancel')}</button>
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