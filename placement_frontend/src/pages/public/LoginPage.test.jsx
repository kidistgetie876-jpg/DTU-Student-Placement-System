import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage.jsx';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('LoginPage password reset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows one unified form and submits student admission ID and given name', async () => {
    api.post.mockResolvedValue({
      data: {
        status: 'success',
        user: { id: 'DTU16R2001', id_number: 'DTU16R2001', username: 'Abebe', role: 'student' },
      },
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'Student Login' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Staff Login' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter admission ID or email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter first name or password')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Admission ID / Email'), {
      target: { value: 'DTU16R2001' },
    });
    fireEvent.change(screen.getByLabelText('First Name / Password'), {
      target: { value: 'Abebe' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('auth/login.php', {
        admission_number: 'DTU16R2001',
        given_name: 'Abebe',
      }, {
        timeout: 15000,
      });
    });
  });

  it('submits email identifiers to the existing staff login contract', async () => {
    api.post.mockResolvedValue({ data: { status: 'error', message: 'Invalid credentials.' } });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Admission ID / Email'), {
      target: { value: 'staff@dtu.edu.et' },
    });
    fireEvent.change(screen.getByLabelText('First Name / Password'), {
      target: { value: 'secret123' },
    });

    expect(screen.getByLabelText('First Name / Password')).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('auth/login.php', {
        email: 'staff@dtu.edu.et',
        password: 'secret123',
      }, {
        timeout: 15000,
      });
    });
  });

  it('requests a reset code and completes password reset', async () => {
    api.post
      .mockResolvedValueOnce({
        data: {
          success: true,
          message: 'If an account uses that email, a verification code will arrive shortly.',
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          status: 'success',
          message: 'Password reset successfully',
        },
      });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Forgot Password?' }));
    fireEvent.change(screen.getByLabelText('Registered email address'), {
      target: { value: 'student@dtu.edu.et' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Request' }));

    expect(await screen.findByLabelText('Six-digit verification code')).toBeInTheDocument();
    expect(api.post).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:8888/student-placement/placement_backend/auth/forgot_password.php', {
      email: 'student@dtu.edu.et',
    });

    fireEvent.change(screen.getByLabelText('Six-digit verification code'), {
      target: { value: '123456' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'newpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Password reset successfully');
    await waitFor(() => {
      expect(api.post).toHaveBeenNthCalledWith(2, 'auth/reset_password.php', {
        email: 'student@dtu.edu.et',
        code: '123456',
        new_password: 'newpass123',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to Sign In' }));
    expect(screen.queryByRole('dialog', { name: 'Password updated' })).not.toBeInTheDocument();
  });

  it('shows the backend error when the reset request fails', async () => {
    api.post.mockRejectedValue({
      response: { data: { message: 'Unable to process the password reset request right now.' } },
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Forgot Password?' }));
    fireEvent.change(screen.getByLabelText('Registered email address'), {
      target: { value: 'student@dtu.edu.et' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to process the password reset request right now.'
    );
  });
});
