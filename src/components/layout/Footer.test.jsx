import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from './Footer.jsx';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

describe('Footer', () => {
  beforeEach(() => {
    localStorage.clear();
    api.get.mockResolvedValue({ data: {} });
  });

  test.each([
    ['admin', '/admin-dashboard'],
    ['registrar', '/registrar-dashboard'],
    ['head', '/head-dashboard'],
    ['student', '/student-dashboard'],
  ])('links a logged-in %s user to their dashboard', (role, dashboardPath) => {
    localStorage.setItem('user', JSON.stringify({ role }));

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Footer />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'My Dashboard' })).toHaveAttribute('href', dashboardPath);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  test('keeps stored user data when a logged-in user follows public links', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'student' }));

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Footer />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: 'Services' }));
    expect(localStorage.getItem('user')).toBe(JSON.stringify({ role: 'student' }));
    expect(screen.getByRole('link', { name: 'My Dashboard' })).toHaveAttribute('href', '/student-dashboard');
  });

  test('shows Sign in when logged out', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Footer />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });
});
