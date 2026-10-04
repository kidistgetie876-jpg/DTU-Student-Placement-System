import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManageDepartments from './ManageDepartments';
import AssignHead from './AssignHead.jsx';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

describe('ManageDepartments', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    api.get.mockImplementation((url) => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({
          data: {
            departments: [
              {
                id: 10,
                name: 'Computer Science',
                capacity: 50,
                description: 'CS dept',
                stream: 'Natural',
                college_name: 'Engineering',
                status: 'active',
                head_id: null,
              },
            ],
          },
        });
      }

      if (url === 'api/admin/users_api.php') {
        return Promise.resolve({
          data: {
            users: [
              { id: 1, username: 'Head User', role: 'head' },
              { id: 2, username: 'Coordinator User', role: 'coordinator' },
            ],
          },
        });
      }

      return Promise.resolve({ data: [] });
    });
  });

  it('renders department columns in the logical order', async () => {
    render(
      <MemoryRouter>
        <ManageDepartments />
      </MemoryRouter>
    );

    expect(await screen.findByText('Computer Science')).toBeInTheDocument();

    expect(screen.getAllByRole('columnheader').map(header => header.textContent)).toEqual([
      '#',
      'STREAM',
      'COLLEGE',
      'NAME',
      'CAPACITY',
      'HEAD NAME',
      'EDIT',
    ]);
    expect(screen.getAllByText('Engineering').length).toBeGreaterThanOrEqual(1);
  });

  it('does not offer a head already assigned to a different department', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({
          data: {
            departments: [
              { id: 10, name: 'Computer Science', head_id: 1 },
              { id: 20, name: 'Electrical Engineering', head_id: 2 },
            ],
          },
        });
      }

      if (url === 'api/admin/users_api.php') {
        return Promise.resolve({
          data: {
            users: [
              { id: 1, username: 'Head User', role: 'head' },
              { id: 2, username: 'Coordinator User', role: 'coordinator' },
              { id: 3, username: 'Available User', role: 'head' },
            ],
          },
        });
      }

      return Promise.resolve({ data: [] });
    });

    render(
      <MemoryRouter>
        <AssignHead />
      </MemoryRouter>
    );

    const departmentSelect = (await screen.findAllByRole('combobox'))[0];
    fireEvent.change(departmentSelect, { target: { value: '20' } });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Available User/i })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Head User/i })).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Coordinator User/i })).toBeInTheDocument();
    });
  });
});
