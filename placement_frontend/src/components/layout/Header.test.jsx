import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header.jsx';
import api from '../../services/api.js';
import { AuthProvider } from '../../contexts/AuthContext.jsx';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const renderHeader = () => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <AuthProvider>
      <Header />
    </AuthProvider>
  </MemoryRouter>
);

describe('public header navigation settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    api.get.mockResolvedValue({ data: { settings: {} } });
  });

  it('uses defaults for omitted links and hides explicitly disabled links', async () => {
    api.get.mockResolvedValue({
      data: {
        settings: {
          navigation: [
            { id: 'home', label: 'Home page', enabled: true },
            { id: 'contact', label: 'Contact', enabled: false },
          ],
        },
      },
    });

    renderHeader();

    const navigation = screen.getByRole('navigation');
    expect(await within(navigation).findByRole('link', { name: 'Home page' })).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Services' })).toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: 'Contact' })).not.toBeInTheDocument();
  });

  it('refreshes links after the settings-updated event', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          settings: {
            navigation: [{ id: 'contact', label: 'Contact is visible', enabled: true }],
          },
        },
      })
      .mockResolvedValue({
        data: {
          settings: {
            navigation: [{ id: 'contact', label: 'Contact', enabled: false }],
          },
        },
      });

    renderHeader();

    const navigation = screen.getByRole('navigation');
    expect(await within(navigation).findByRole('link', { name: 'Contact is visible' })).toBeInTheDocument();

    window.dispatchEvent(new Event('system-settings-updated'));

    await waitFor(() => {
      expect(within(navigation).queryByRole('link', { name: 'Contact' })).not.toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
