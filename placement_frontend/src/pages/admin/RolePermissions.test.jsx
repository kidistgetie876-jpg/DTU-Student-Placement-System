import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RolePermissions from './RolePermissions.jsx';
import { RolePermissionsProvider } from '../../contexts/RolePermissionsContext.jsx';
import { defaultRolePermissions } from '../../permissions/roleFeatures.js';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('RolePermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({
      data: { success: true, permissions: defaultRolePermissions },
    });
    api.post.mockImplementation((_, { permissions }) => Promise.resolve({
      data: { success: true, permissions },
    }));
  });

  test('shows workspaces for all roles and persists feature toggles', async () => {
    render(
      <RolePermissionsProvider>
        <RolePermissions />
      </RolePermissionsProvider>
    );

    expect(await screen.findByRole('tab', { name: 'Student Dashboard & Services' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Registrar Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Department Head Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Admin System Settings' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Academic Profile & Status Open' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/common/role_permissions_api.php', {
        permissions: expect.objectContaining({ 'student.overview': false }),
      });
    });
  });

  test('keeps Admin System Settings enabled to avoid locking out administrators', async () => {
    render(
      <RolePermissionsProvider>
        <RolePermissions />
      </RolePermissionsProvider>
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Admin System Settings' }));

    expect(screen.getByRole('switch', { name: 'System Settings Open' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'System Settings Open' })).toBeDisabled();
  });
});
