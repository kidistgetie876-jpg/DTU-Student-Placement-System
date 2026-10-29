import React, { useState } from 'react';
import SystemConfig from './SystemConfig.jsx';
import { useRolePermissions } from '../../contexts/RolePermissionsContext.jsx';
import { roleFeatures } from '../../permissions/roleFeatures.js';

const RolePermissions = () => {
  const [activeRole, setActiveRole] = useState('student');
  const [savingFeature, setSavingFeature] = useState('');
  const [saveError, setSaveError] = useState('');
  const { permissions, loading, error, refresh, updatePermission } = useRolePermissions();
  const role = roleFeatures[activeRole];

  const handleToggle = async (featureId, enabled) => {
    setSavingFeature(featureId);
    setSaveError('');
    try {
      await updatePermission(featureId, enabled);
    } catch (requestError) {
      setSaveError(requestError.response?.data?.message || requestError.message || 'Unable to save this permission.');
    } finally {
      setSavingFeature('');
    }
  };

  const retryPermissions = async () => {
    try {
      await refresh();
    } catch (requestError) {
      setSaveError(requestError.response?.data?.message || requestError.message || 'Unable to reload role permissions.');
    }
  };

  return (
    <section className="container-fluid py-3" aria-labelledby="role-permissions-heading">
      <header className="mb-4">
        <h1 id="role-permissions-heading" className="h3 fw-bold">Role &amp; Permissions</h1>
        <p className="text-muted mb-0">
          Review role workspaces and control which dashboard features are available to each role.
        </p>
      </header>

      <div className="d-flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Role workspaces">
        {Object.entries(roleFeatures).map(([roleId, roleDefinition]) => (
          <button
            key={roleId}
            id={`role-tab-${roleId}`}
            type="button"
            className={`btn ${activeRole === roleId ? 'btn-primary' : 'btn-outline-primary'}`}
            role="tab"
            aria-selected={activeRole === roleId}
            aria-controls={`role-panel-${roleId}`}
            onClick={() => setActiveRole(roleId)}
          >
            {roleDefinition.label}
          </button>
        ))}
      </div>

      <section
        id={`role-panel-${activeRole}`}
        role="tabpanel"
        aria-labelledby={`role-tab-${activeRole}`}
        className="card border-0 shadow-sm"
      >
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">{role.label}</h2>
          {loading && <p role="status" className="text-muted">Loading saved permissions…</p>}
          {error && (
            <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
              <span>{error} Default values are displayed until permissions can be loaded.</span>
              <button type="button" className="btn btn-sm btn-outline-warning" onClick={retryPermissions}>
                Retry
              </button>
            </div>
          )}
          {saveError && <div className="alert alert-danger" role="alert">{saveError}</div>}

          <div className="list-group list-group-flush">
            {role.features.map((feature) => {
              const isAlwaysOpen = feature.alwaysOpen === true;
              const isEnabled = isAlwaysOpen || permissions[feature.id] !== false;
              return (
                <div
                  key={feature.id}
                  className="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-3 px-0 py-3"
                >
                  <div>
                    <h3 className="h6 mb-1">{feature.label}</h3>
                    <span className={`badge ${isEnabled ? 'bg-success' : 'bg-secondary'}`}>
                      {isEnabled ? 'Open' : 'Closed'}
                    </span>
                    {isAlwaysOpen && <span className="ms-2 small text-muted">Required to manage and restore permissions</span>}
                  </div>
                  <div className="form-check form-switch mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id={`permission-${feature.id}`}
                      aria-label={`${feature.label} ${isEnabled ? 'Open' : 'Closed'}`}
                      checked={isEnabled}
                      disabled={isAlwaysOpen || loading || Boolean(error) || savingFeature !== ''}
                      onChange={(event) => handleToggle(feature.id, event.target.checked)}
                    />
                    <label className="form-check-label" htmlFor={`permission-${feature.id}`}>
                      {isEnabled ? 'Enabled' : 'Disabled'}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          {activeRole === 'admin' && (
            <section className="mt-4 pt-4 border-top" aria-labelledby="admin-system-settings-heading">
              <h2 id="admin-system-settings-heading" className="h5 fw-bold mb-3">Admin System Settings</h2>
              <SystemConfig />
            </section>
          )}
        </div>
      </section>
    </section>
  );
};

export default RolePermissions;
