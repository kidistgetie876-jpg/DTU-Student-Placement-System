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

  it('shows heads before department selection and prevents assigning a head from another department', async () => {
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

    const [departmentSelect, headSelect] = await screen.findAllByRole('combobox');
    expect(screen.getByRole('option', { name: /Head User — assigned to Computer Science/i })).toBeDisabled();
    expect(screen.getByRole('option', { name: /Coordinator User — assigned to Electrical Engineering/i })).toBeDisabled();
    expect(screen.getByRole('option', { name: /Available User/i })).toBeEnabled();

    fireEvent.change(departmentSelect, { target: { value: '20' } });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Available User/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Head User — assigned to Computer Science/i })).toBeDisabled();
      expect(screen.getByRole('option', { name: /Coordinator User/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Coordinator User/i })).toBeEnabled();
    });
    expect(headSelect).toBeInTheDocument();
  });

  it('allows searching and selecting a head after choosing a department', async () => {
    api.get.mockImplementation((url) => {
      if (url === 'api/common/departments_api.php') {
        return Promise.resolve({ data: { departments: [{ id: 10, name: 'Computer Science', head_id: 1 }] } });
      }

      if (url === 'api/admin/users_api.php') {
        return Promise.resolve({
          data: {
            users: [
              { id: 1, username: 'alpha', first_name: 'Alpha', last_name: 'Head', role: 'head' },
              { id: 2, username: 'beta', first_name: 'Beta', last_name: 'Coordinator', role: 'coordinator' },
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

    const [departmentSelect, headSelect] = await screen.findAllByRole('combobox');
    const searchInput = screen.getByRole('searchbox', { name: 'Search available heads' });
    fireEvent.change(searchInput, { target: { value: 'beta' } });
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();

    fireEvent.change(departmentSelect, { target: { value: '10' } });
    await waitFor(() => {
      expect(departmentSelect).toHaveValue('10');
      expect(searchInput).toHaveValue('beta');
      expect(headSelect).toHaveValue('');
      expect(screen.getByRole('option', { name: /Beta Coordinator/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Alpha Head/ })).not.toBeInTheDocument();
    });

    fireEvent.change(headSelect, { target: { value: '2' } });
    expect(headSelect).toHaveValue('2');
    api.put.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Assignment' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      'api/common/departments_api.php',
      { id: 10, head_id: 2 }
    ));
  });

  it('keeps matching heads unavailable when assigned to a different department', async () => {
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

    const [departmentSelect, headSelect] = await screen.findAllByRole('combobox');
    fireEvent.change(departmentSelect, { target: { value: '20' } });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Head User .*assigned to Computer Science/i })).toBeDisabled();
      expect(screen.getByRole('option', { name: /Coordinator User/i })).toBeEnabled();
    });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search available heads' }), {
      target: { value: 'head user' },
    });
    expect(screen.getByRole('option', { name: /Head User .*assigned to Computer Science/i })).toBeDisabled();
    expect(headSelect).toHaveValue('');
  });
});
