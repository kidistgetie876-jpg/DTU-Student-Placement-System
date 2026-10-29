import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api.js';
import { defaultRolePermissions, rolePermissionIsOpen } from '../permissions/roleFeatures.js';

const RolePermissionsContext = createContext(null);

export const RolePermissionsProvider = ({ children }) => {
  const [permissions, setPermissions] = useState(defaultRolePermissions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('api/common/role_permissions_api.php');
      if (!response.data?.success || !response.data?.permissions) {
        throw new Error(response.data?.message || 'Unable to load role permissions.');
      }
      setPermissions({ ...defaultRolePermissions, ...response.data.permissions });
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to load role permissions.');
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch((requestError) => {
      console.error('Unable to load role permissions:', requestError);
    });
  }, [refresh]);

  const updatePermission = useCallback(async (permissionId, enabled) => {
    const updatedPermissions = {
      ...permissions,
      [permissionId]: permissionId === 'admin.system-settings' ? true : enabled,
    };
    const response = await api.post('api/common/role_permissions_api.php', {
      permissions: updatedPermissions,
    });
    if (!response.data?.success || !response.data?.permissions) {
      throw new Error(response.data?.message || 'Unable to save role permissions.');
    }
    setPermissions({ ...defaultRolePermissions, ...response.data.permissions });
    setError('');
  }, [permissions]);

  const value = useMemo(() => ({
    permissions,
    loading,
    error,
    refresh,
    updatePermission,
    isOpen: (permissionId) => rolePermissionIsOpen(permissions, permissionId),
  }), [permissions, loading, error, refresh, updatePermission]);

  return (
    <RolePermissionsContext.Provider value={value}>
      {children}
    </RolePermissionsContext.Provider>
  );
};

export const useRolePermissions = () => {
  const context = useContext(RolePermissionsContext);
  if (!context) {
    throw new Error('useRolePermissions must be used within a RolePermissionsProvider.');
  }
  return context;
};
