import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import api from './services/api.js';

jest.mock('./services/api.js', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('./components/layout/Header.jsx', () => ({
  __esModule: true,
  default: () => <header>Site header</header>,
}));
jest.mock('./components/layout/Footer.jsx', () => ({
  __esModule: true,
  default: () => <footer>Site footer</footer>,
}));
jest.mock('./pages/admin/Admin_Dashboard.jsx', () => ({
  __esModule: true,
  default: () => <div>Admin dashboard available</div>,
}));

const maintenanceSettings = {
  enabled: true,
  title: 'Scheduled maintenance',
  message: 'The placement portal is updating.',
  expectedReturn: 'Estimated Return: 2:00 PM',
};

describe('App maintenance lockdown', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    api.get.mockResolvedValue({ data: { settings: { maintenance: maintenanceSettings } } });
  });

  it('replaces public pages with the maintenance view and keeps an admin login path', async () => {
    window.history.pushState({}, '', '/services');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Scheduled maintenance' })).toBeInTheDocument();
    expect(screen.getByText('The placement portal is updating.')).toBeInTheDocument();
    expect(screen.getByText('Estimated Return: 2:00 PM')).toBeInTheDocument();
    expect(screen.queryByText('Site header')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Admin Login' }));
    expect(await screen.findByLabelText(/username or email/i)).toBeInTheDocument();
  });

  it('allows an authenticated administrator to open the dashboard during maintenance', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin' }));
    window.history.pushState({}, '', '/admin-dashboard');

    render(<App />);

    expect(await screen.findByText('Admin dashboard available')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Scheduled maintenance' })).not.toBeInTheDocument();
    expect(screen.getByText('Site footer')).toBeInTheDocument();
  });
});
