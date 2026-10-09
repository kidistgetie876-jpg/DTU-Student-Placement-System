import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../../services/api.js';
import RegistrarDashboard from './RegistrarDashboard.jsx';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('Registrar department status controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('user', JSON.stringify({ id: 7, username: 'registrar', role: 'registrar' }));
    sessionStorage.setItem('registrarActiveTab', 'department-status');

    let departmentStatus = 'active';
    api.get.mockImplementation((url) => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({
          data: {
            success: true,
            departments: [{
              id: 21,
              name: 'Biology',
              college_name: 'College of Natural Science',
              capacity: 40,
              status: departmentStatus,
            }],
          },
        });
      }
      if (url === 'api/admin/users_api.php') {
        return Promise.resolve({ data: { success: true, users: [] } });
      }
      return Promise.resolve({ data: { success: true, appeals: [], results: [], settings: {} } });
    });
    api.post.mockImplementation((url, payload) => {
      if (url === 'api/common/departments_update.php') {
        departmentStatus = payload.departments[0].status;
      }
      return Promise.resolve({ data: { success: true } });
    });
  });

  it('saves a department deactivation immediately and confirms it from the refreshed list', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RegistrarDashboard />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Department & College Placement Status' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Deactivate' })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate' })[0]);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/common/departments_update.php',
      { departments: [{ id: 21, status: 'inactive' }] }
    ));
    expect(await screen.findByText(/Status saved and confirmed/)).toBeInTheDocument();
    expect(screen.getAllByText('Inactive')).toHaveLength(2);
  });
});
