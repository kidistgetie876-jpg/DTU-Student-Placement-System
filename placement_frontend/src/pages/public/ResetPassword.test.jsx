import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../../services/api.js';
import ResetPassword from './ResetPassword.jsx';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const renderResetPage = () => render(
  <MemoryRouter
    initialEntries={['/reset-password?token=valid-token']}
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
  >
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  </MemoryRouter>
);

describe('ResetPassword', () => {
  beforeEach(() => {
    api.post.mockReset();
  });

  it('requires matching passwords before submitting', async () => {
    renderResetPage();
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'different123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The passwords do not match.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('submits the token and new password, then confirms success', async () => {
    api.post.mockResolvedValue({ data: { message: 'Password reset complete.' } });
    renderResetPage();
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('auth/reset_password.php', {
      token: 'valid-token',
      newPassword: 'password123',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Password reset complete.');
  });
});
