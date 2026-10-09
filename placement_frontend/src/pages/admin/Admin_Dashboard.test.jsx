import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from './Admin_Dashboard.jsx';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('AdminDashboard registrar overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('user', JSON.stringify({
      id: 1,
      username: 'admin',
      role: 'admin',
    }));
    api.get.mockImplementation((url) => {
      if (url === 'api/common/dashboard_overview_api.php') {
        return Promise.resolve({ data: { success: true, data: { activeStudents: 2, departments: 1 } } });
      }
      if (url === 'api/admin/users_api.php') {
        return Promise.resolve({
          data: {
            users: [
              { id: 1, username: 'admin', role: 'admin' },
              { id: 2, username: 'registrar-one', email: 'registrar1@example.test', role: 'registrar' },
              { id: 3, username: 'registrar-two', email: 'registrar2@example.test', role: 'Registrar' },
              { id: 4, username: 'student-one', role: 'student' },
            ],
          },
        });
      }
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({ data: { success: true, departments: [{ id: 10, name: 'Computer Science' }] } });
      }
      return Promise.resolve({ data: { success: true } });
    });
  });

  it('shows the registrar count and opens a registrar-only detail list', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminDashboard />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'Data Import' })).not.toBeInTheDocument();

    const cardLabel = await screen.findByText('Total Registrars');
    const registrarCard = cardLabel.closest('.summary-card');
    expect(registrarCard).toBeInTheDocument();
    await waitFor(() => expect(within(registrarCard).getByText('2')).toBeInTheDocument());

    fireEvent.click(registrarCard);

    expect(await screen.findByRole('heading', { name: 'Registrar Accounts' })).toBeInTheDocument();
    expect(screen.getByText('registrar-one')).toBeInTheDocument();
    expect(screen.getByText('registrar-two')).toBeInTheDocument();
    expect(screen.queryByText('student-one')).not.toBeInTheDocument();
  });
});
