import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManageUsers from './ManageUsers';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    put: jest.fn(),
  },
}));

describe('ManageUsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({
      data: {
        users: [{ id: 1, username: 'alice', email: 'alice@example.com', role: 'student', id_number: 'DTU16R1001' }],
      },
    });
    api.put.mockResolvedValue({
      data: {
        success: true,
        user: { id: 1, username: 'alice2', email: 'alice2@example.com', role: 'admin' },
      },
    });
  });

  it('updates a user when save is clicked', async () => {
    render(
      <MemoryRouter>
        <ManageUsers />
      </MemoryRouter>
    );

    expect(await screen.findByText('alice')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    const usernameInput = screen.getByLabelText(/username/i);
    const emailInput = screen.getByLabelText(/email/i);
    const roleSelect = screen.getByLabelText(/role/i);

    fireEvent.change(usernameInput, { target: { value: 'alice2' } });
    fireEvent.change(emailInput, { target: { value: 'alice2@example.com' } });
    fireEvent.change(roleSelect, { target: { value: 'admin' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ id_number: 'DTU16R1001' }));
    expect(await screen.findByText('alice2')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('falls back to the database ID when id_number is missing', async () => {
    api.get.mockResolvedValue({
      data: {
        users: [{ id: 1, username: 'alice', email: 'alice@example.com', role: 'student' }],
      },
    });

    render(
      <MemoryRouter>
        <ManageUsers />
      </MemoryRouter>
    );

    expect(await screen.findByText('1')).toBeInTheDocument();
  });

  it('generates an editable ID for the selected role', async () => {
    api.get.mockResolvedValue({
      data: {
        users: [
          { id: 1, username: 'student1', role: 'student', id_number: 'DTU16R1001' },
          { id: 2, username: 'head1', role: 'head', id_number: 'DTU-HOD-002' },
          { id: 3, username: 'registrar1', role: 'registrar', id_number: 'DTU-REG-007' },
          { id: 4, username: 'admin1', role: 'admin', id_number: 'DTU-ADM-009' },
        ],
      },
    });

    render(
      <MemoryRouter>
        <ManageUsers />
      </MemoryRouter>
    );

    const roleSelect = screen.getByLabelText('Role');
    const idInput = await screen.findByLabelText('Student ID (DTU Format)');
    await waitFor(() => expect(idInput).toHaveValue('DTU16R1002'));
    expect(idInput).not.toHaveAttribute('readonly');

    fireEvent.change(roleSelect, { target: { value: 'head' } });
    expect(await screen.findByLabelText('Head of Dept ID (Staff Format)')).toHaveValue('DTU-HOD-003');

    fireEvent.change(roleSelect, { target: { value: 'registrar' } });
    expect(await screen.findByLabelText('Registrar ID (Staff Format)')).toHaveValue('DTU-REG-008');

    fireEvent.change(roleSelect, { target: { value: 'admin' } });
    expect(await screen.findByLabelText('Admin ID (Staff Format)')).toHaveValue('DTU-ADM-010');

    expect(await screen.findByText('DTU16R1001')).toBeInTheDocument();
    expect(screen.getByText('DTU-HOD-002')).toBeInTheDocument();
    expect(screen.getByText('DTU-REG-007')).toBeInTheDocument();
    expect(screen.getByText('DTU-ADM-009')).toBeInTheDocument();
  });

  it('sends the selected role ID when creating a user', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    render(
      <MemoryRouter>
        <ManageUsers />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Taylor' } });
    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Morgan' } });
    fireEvent.change(screen.getByLabelText('Username', { selector: 'input' }), { target: { value: 'taylor' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'securepw' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'head' } });
    await screen.findByLabelText('Head of Dept ID (Staff Format)');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/admin/users_api.php', {
        first_name: 'Taylor',
        last_name: 'Morgan',
        username: 'taylor',
        password: 'securepw',
        email: '',
        role: 'head',
        phone_number: '',
        id_number: 'DTU-HOD-001',
      });
    });
  });
});
