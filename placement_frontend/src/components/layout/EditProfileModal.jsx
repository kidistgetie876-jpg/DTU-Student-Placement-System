import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '../../services/api.js';
import './DashboardHeader.css';

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const EditProfileModal = ({ profile, onClose, onSaved }) => {
  const [fullName, setFullName] = useState(profile.full_name || profile.username || '');
  const [email, setEmail] = useState(profile.email || '');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview('');
      return undefined;
    }
    const previewUrl = URL.createObjectURL(photo);
    setPhotoPreview(previewUrl);
    return () => {
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previewUrl);
    };
  }, [photo]);

  const selectPhoto = (event) => {
    const selected = event.target.files?.[0] || null;
    setError('');
    if (!selected) {
      setPhoto(null);
      return;
    }
    if (!ACCEPTED_PHOTO_TYPES.includes(selected.type)) {
      setPhoto(null);
      event.target.value = '';
      setError('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (selected.size > PHOTO_MAX_BYTES) {
      setPhoto(null);
      event.target.value = '';
      setError('Profile photos must be 5 MB or smaller.');
      return;
    }
    setPhoto(selected);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const name = fullName.trim();
    const normalizedEmail = email.trim();
    if (!name) {
      setError('Enter your full name.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    const formData = new FormData();
    formData.append('full_name', name);
    formData.append('email', normalizedEmail);
    if (photo) formData.append('profile_photo', photo);

    setSaving(true);
    try {
      const response = await api.post('api/common/update_profile.php', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (!response.data?.success || !response.data?.profile) {
        throw new Error(response.data?.message || 'Unable to update profile.');
      }
      onSaved(response.data.profile);
      setSuccess(response.data.message || 'Profile updated successfully.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const currentPhoto = profile.profile_photo
    ? `${api.defaults.baseURL.replace(/\/+$/, '')}/${profile.profile_photo.replace(/^\/+/, '')}`
    : '';

  return (
    <div className="dashboard-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section
        className="dashboard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-modal-title"
      >
        <div className="dashboard-modal-header">
          <h3 id="dashboard-modal-title">Edit Profile</h3>
          <button type="button" className="dashboard-modal-close" aria-label="Close" onClick={onClose} disabled={saving}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
        {success && <div className="alert alert-success py-2" role="status">{success}</div>}

        <form onSubmit={saveProfile}>
          <div className="dashboard-profile-photo-field">
            <div className="dashboard-profile-photo-preview">
              {photoPreview || currentPhoto
                ? <img src={photoPreview || currentPhoto} alt="Profile preview" />
                : <span aria-hidden="true">{(fullName || '?').slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="dashboard-profile-photo-input">
              <label className="form-label" htmlFor="dashboard-profile-photo">Profile Photo</label>
              <input
                id="dashboard-profile-photo"
                className="form-control"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={selectPhoto}
                disabled={saving}
              />
              <small className="text-muted">JPEG, PNG, or WebP; up to 5 MB.</small>
            </div>
          </div>

          <label className="form-label" htmlFor="dashboard-profile-name">Full Name</label>
          <input
            id="dashboard-profile-name"
            className="form-control mb-3"
            type="text"
            autoComplete="name"
            maxLength={200}
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            disabled={saving}
          />
          <label className="form-label" htmlFor="dashboard-profile-email">Email</label>
          <input
            id="dashboard-profile-email"
            className="form-control mb-3"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={saving}
          />
          <div className="dashboard-modal-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default EditProfileModal;
