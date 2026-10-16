import React from 'react';
import { X } from 'lucide-react';
import PasswordInput from './PasswordInput.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

const ChangePasswordModal = ({
  error,
  onClose,
  onSubmit,
  passwordForm,
  setPasswordForm,
  success,
}) => {
  const { t } = useLanguage();

  return (
    <div className="dashboard-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-modal-title">
        <div className="dashboard-modal-header">
          <h3 id="dashboard-modal-title">{t('Change Password')}</h3>
          <button type="button" className="dashboard-modal-close" aria-label={t('Close')} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
        {success && <div className="alert alert-success py-2" role="status">{success}</div>}
        <form onSubmit={onSubmit}>
          <label className="form-label" htmlFor="dashboard-current-password">{t('Current Password')}</label>
          <PasswordInput
            id="dashboard-current-password"
            className="mb-3"
            autoComplete="current-password"
            label={t('current password')}
            required
            value={passwordForm.current_password}
            onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
          />
          <label className="form-label" htmlFor="dashboard-new-password">{t('New Password')}</label>
          <PasswordInput
            id="dashboard-new-password"
            className="mb-3"
            autoComplete="new-password"
            label={t('new password')}
            minLength={8}
            required
            value={passwordForm.new_password}
            onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
          />
          <label className="form-label" htmlFor="dashboard-confirm-password">{t('Confirm New Password')}</label>
          <PasswordInput
            id="dashboard-confirm-password"
            className="mb-3"
            autoComplete="new-password"
            label={t('confirm password')}
            minLength={8}
            required
            value={passwordForm.confirm_password}
            onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))}
          />
          <div className="dashboard-modal-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>{t('Cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('Change Password')}</button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default ChangePasswordModal;
