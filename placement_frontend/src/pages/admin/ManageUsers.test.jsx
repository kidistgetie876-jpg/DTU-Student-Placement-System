import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ManageUsers from './ManageUsers';
import EditUser from './EditUser';
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
    const originalUser = {
      id: 1,
      first_name: 'Alice',
      last_name: 'Smith',
      username: 'alice',
      email: 'alice@example.com',
      role: 'student',
      id_number: 'DTU16R1001',
    };
    api.get
      .mockResolvedValueOnce({ data: { users: [originalUser] } })
      .mockResolvedValueOnce({
        data: {
          users: [{
            ...originalUser,
            first_name: 'Alicia',
            last_name: 'Jones',
            username: 'alice2',
            email: 'alice2@gmail.com',
            role: 'admin',
          }],
        },
      });

    render(
      <MemoryRouter initialEntries={['/admin-dashboard']}>
        <Routes>
          <Route path="/admin-dashboard" element={<ManageUsers />} />
          <Route path="/edit-user/:id" element={<EditUser />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('alice')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(await screen.findByRole('heading', { name: 'Edit User' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Alicia' } });
    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Jones' } });
    const usernameInput = screen.getByLabelText(/username/i);
    const emailInput = screen.getByLabelText(/email/i);
    const roleSelect = screen.getByLabelText(/role/i);

    fireEvent.change(usernameInput, { target: { value: 'alice2' } });
    fireEvent.change(emailInput, { target: { value: 'alice2@gmail.com' } });
    fireEvent.change(roleSelect, { target: { value: 'admin' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      'api/admin/users_api.php?id=1',
      expect.objectContaining({
        first_name: 'Alicia',
        last_name: 'Jones',
        id_number: 'DTU16R1001',
      })
    ));
    expect(await screen.findByText('alice2')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'First Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Last Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByText('Alicia')).toBeInTheDocument();
    expect(screen.getByText('Jones')).toBeInTheDocument();
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

  it('offers only staff roles and generates editable IDs for the selected role', async () => {
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
    expect(roleSelect).toHaveValue('registrar');
    expect(screen.getAllByRole('option').map((option) => option.value)).toEqual(['head', 'admin', 'registrar']);
    expect(screen.queryByRole('option', { name: 'Student' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Student ID (DTU Format)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Students' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Registrar ID (Staff Format)')).toHaveValue('DTU-REG-008'));

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

  it('sends the required Gmail address and selected role ID when creating a user', async () => {
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
    fireEvent.change(screen.getByLabelText('Email Address *'), { target: { value: 'taylor@gmail.com' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'head' } });
    await screen.findByLabelText('Head of Dept ID (Staff Format)');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/admin/users_api.php', {
        first_name: 'Taylor',
        last_name: 'Morgan',
        username: 'taylor',
        password: 'securepw',
        email: 'taylor@gmail.com',
        role: 'head',
        phone_number: '',
        id_number: 'DTU-HOD-001',
      });
    });

  });

  it('requires a valid Gmail address before creating a user', async () => {
    render(
      <MemoryRouter>
        <ManageUsers />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText('Email Address *');
    expect(emailInput).toBeRequired();
    fireEvent.change(emailInput, { target: { value: 'taylor@example.com' } });
    fireEvent.submit(emailInput.closest('form'));

    expect(await screen.findByRole('alert')).toHaveTextContent('A valid @gmail.com address is required.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('prevents user creation when the password is shorter than eight characters', async () => {
    render(
      <MemoryRouter>
        <ManageUsers />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('minLength', '8');
    fireEvent.change(passwordInput, { target: { value: 'seven77' } });
    fireEvent.submit(passwordInput.closest('form'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Password must be at least 8 characters long.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows the Gmail requirement when the email field is empty', async () => {
    render(
      <MemoryRouter>
        <ManageUsers />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText('Email Address *');
    expect(emailInput).toBeRequired();
    fireEvent.invalid(emailInput);

    expect(await screen.findByRole('alert')).toHaveTextContent('A valid @gmail.com address is required.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows a clear message when the phone number is already registered', async () => {
    api.post.mockRejectedValue({
      response: {
        status: 400,
        data: {
          success: false,
          message: 'Phone number already exists in the system.',
        },
      },
    });

    render(
      <MemoryRouter>
        <ManageUsers />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Taylor' } });
    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Morgan' } });
    fireEvent.change(screen.getByLabelText('Username', { selector: 'input' }), { target: { value: 'taylor' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'securepw' } });
    fireEvent.change(screen.getByLabelText('Email Address *'), { target: { value: 'taylor@gmail.com' } });
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '0912345678' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This phone number is already registered.');
  });

  it('shows a clear message when the Gmail address is already registered', async () => {
    api.post.mockRejectedValue({
      response: {
        status: 400,
        data: {
          success: false,
          message: 'This email address is already registered.',
        },
      },
    });

    render(
      <MemoryRouter>
        <ManageUsers />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Taylor' } });
    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Morgan' } });
    fireEvent.change(screen.getByLabelText('Username', { selector: 'input' }), { target: { value: 'taylor' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'securepw' } });
    fireEvent.change(screen.getByLabelText('Email Address *'), { target: { value: 'taylor@gmail.com' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This email address is already registered.');
  });
});
