import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../../services/api.js';
import DashboardHeader from './DashboardHeader.jsx';
import Header from './Header.jsx';
import { LanguageProvider } from '../../contexts/LanguageContext.jsx';
import { ThemeProvider } from '../../contexts/ThemeContext.jsx';

const renderDashboardHeader = (props = {}) => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <ThemeProvider>
      <LanguageProvider>
        <Routes>
          <Route
            path="/dashboard"
            element={(
              <DashboardHeader
                username="Aster"
                role="Registrar"
                subtitle="Review placements, departments, and approvals."
                dashboardPath="/dashboard"
                {...props}
              />
            )}
          />
          <Route path="/login" element={<div>Login destination</div>} />
        </Routes>
      </LanguageProvider>
    </ThemeProvider>
  </MemoryRouter>
);

const renderGlobalDashboardHeader = () => render(
  <MemoryRouter initialEntries={['/registrar-dashboard/overview']}>
    <ThemeProvider>
      <LanguageProvider>
        <Routes>
          <Route path="/registrar-dashboard/overview" element={<Header />} />
        </Routes>
      </LanguageProvider>
    </ThemeProvider>
  </MemoryRouter>
);

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe('DashboardHeader', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL });
    } else {
      delete URL.createObjectURL;
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL });
    } else {
      delete URL.revokeObjectURL;
    }
  });

  beforeEach(() => {
    jest.spyOn(api, 'get').mockImplementation((path) => Promise.resolve({
      data: path === 'api/common/get_profile.php'
        ? {
            success: true,
            profile: {
              id: 7,
              first_name: 'Aster',
              last_name: 'Gebre',
              full_name: 'Aster Gebre',
              username: 'Aster',
              email: 'aster@example.com',
              role: 'registrar',
            },
          }
        : { success: true, notifications: [], unread_count: 0 },
    }));
    localStorage.removeItem('language');
    localStorage.removeItem('darkMode');
    localStorage.removeItem('themeMode');
    document.documentElement.classList.remove('dark-mode', 'eye-care-mode');
    document.body.classList.remove('dark-mode', 'eye-care-mode');
    localStorage.setItem('user', JSON.stringify({
      first_name: 'Aster',
      last_name: 'Gebre',
      username: 'Aster',
      email: 'aster@example.com',
      role: 'registrar',
    }));
  });

  it('toggles and persists dark mode', () => {
    renderDashboardHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(document.documentElement).toHaveClass('dark-mode');
    expect(localStorage.getItem('darkMode')).toBe('true');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });

  it('enables and persists Eye Care Mode from the dashboard header', () => {
    renderDashboardHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to eye care mode' }));

    expect(document.documentElement).toHaveClass('eye-care-mode');
    expect(document.documentElement).not.toHaveClass('dark-mode');
    expect(localStorage.getItem('themeMode')).toBe('eye-care');
    expect(screen.getByRole('button', { name: 'Turn off eye care mode' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers English and Amharic from the language dropdown', () => {
    renderDashboardHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'አማርኛ' }));

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('እንኳን ደህና መጡ, Aster!');
    expect(screen.getByRole('button', { name: 'ቋንቋ ይምረጡ' })).toHaveTextContent('አማርኛ');
    expect(document.documentElement).toHaveAttribute('lang', 'am');
    expect(localStorage.getItem('language')).toBe('am');
  });

  it('shows the profile card, role badge, and notification count', () => {
    renderDashboardHeader();

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aster Gebre, aster@example.com' }));

    expect(screen.getByRole('menu', { name: 'User profile menu' })).toBeInTheDocument();
    const profileMenu = screen.getByRole('menu', { name: 'User profile menu' });
    expect(within(profileMenu).getByText('Aster Gebre')).toBeInTheDocument();
    expect(within(profileMenu).getByText('aster@example.com')).toBeInTheDocument();
    expect(screen.getByText('Registrar')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'My Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View Profile / Edit Profile' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Change Password' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Dashboard Settings' })).toBeInTheDocument();
  });

  it('loads the profile from the authenticated profile API', async () => {
    renderDashboardHeader();

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('api/common/get_profile.php'));
    fireEvent.click(screen.getByRole('button', { name: 'Aster Gebre, aster@example.com' }));
    expect(screen.getByRole('menu', { name: 'User profile menu' })).toHaveTextContent('Aster Gebre');
    expect(screen.getByRole('menu', { name: 'User profile menu' })).toHaveTextContent('Registrar');
  });

  it('loads unread notifications, marks a selected notification and supports mark all read', async () => {
    api.get.mockImplementation((path) => Promise.resolve({
      data: path === 'api/common/get_profile.php'
        ? {
            success: true,
            profile: {
              id: 7,
              first_name: 'Aster',
              last_name: 'Gebre',
              full_name: 'Aster Gebre',
              username: 'Aster',
              email: 'aster@example.com',
              role: 'registrar',
            },
          }
        : {
            success: true,
            unread_count: 2,
            notifications: [
              { id: 31, title: 'First alert', message: 'First message', is_read: 0, notification_type: 'general' },
              { id: 32, title: 'Second alert', message: 'Second message', is_read: 0, notification_type: 'general' },
              { id: 33, title: 'Earlier alert', message: 'Earlier message', is_read: 1, notification_type: 'general' },
            ],
          },
    }));
    const postSpy = jest.spyOn(api, 'post').mockResolvedValue({ data: { success: true } });
    renderDashboardHeader({ variant: 'navigation' });

    const bellButton = await screen.findByRole('button', { name: 'Notifications (2)' });
    expect(api.get).toHaveBeenCalledWith('api/common/get_notifications.php');
    fireEvent.click(bellButton);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /First alert/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications (1)' })).toBeInTheDocument());
    expect(postSpy).toHaveBeenCalledWith('api/common/mark_notifications_read.php', {
      notification_id: 31,
      notification_type: 'general',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument());
    expect(postSpy).toHaveBeenCalledWith('api/common/mark_notifications_read.php', { mark_all: true });
    expect(screen.queryByRole('button', { name: 'Notifications (0)' })).not.toBeInTheDocument();
  });

  it('updates full name and email using the profile API', async () => {
    const updatedProfile = {
      id: 7,
      first_name: 'Aster',
      last_name: 'Abebe',
      full_name: 'Aster Abebe',
      username: 'Aster',
      email: 'aster.abebe@example.com',
      role: 'registrar',
    };
    jest.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, message: 'Profile updated successfully.', profile: updatedProfile },
    });
    renderDashboardHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Aster Gebre, aster@example.com' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'View Profile / Edit Profile' }));
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Aster Abebe' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'aster.abebe@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/common/update_profile.php',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ));
    const formData = api.post.mock.calls[0][1];
    expect(formData.get('full_name')).toBe('Aster Abebe');
    expect(formData.get('email')).toBe('aster.abebe@example.com');
    expect(await screen.findByRole('status')).toHaveTextContent('Profile updated successfully.');
    expect(localStorage.getItem('user')).toContain('aster.abebe@example.com');
  });

  it('previews and uploads a validated profile photo', async () => {
    const photo = new File(['image-data'], 'profile.png', { type: 'image/png' });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:profile-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    jest.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        message: 'Profile updated successfully.',
        profile: {
          id: 7,
          full_name: 'Aster Gebre',
          first_name: 'Aster',
          last_name: 'Gebre',
          username: 'Aster',
          email: 'aster@example.com',
          role: 'registrar',
          profile_photo: 'uploads/profile-photos/0123456789abcdef0123456789abcdef.png',
        },
      },
    });
    renderDashboardHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Aster Gebre, aster@example.com' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'View Profile / Edit Profile' }));
    fireEvent.change(screen.getByLabelText('Profile Photo'), { target: { files: [photo] } });
    expect(await screen.findByAltText('Profile preview')).toHaveAttribute('src', expect.stringContaining('blob:'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/common/update_profile.php',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ));
    expect(api.post.mock.calls[0][1].get('profile_photo')).toBe(photo);
    fireEvent.click(screen.getByRole('button', { name: 'Aster Gebre, aster@example.com' }));
    const displayedPhotos = document.querySelectorAll('.dashboard-profile-avatar img');
    expect(displayedPhotos).toHaveLength(2);
    expect(displayedPhotos[0].getAttribute('src')).toContain('uploads/profile-photos/0123456789abcdef0123456789abcdef.png');
  });

  it('renders a clean greeting without controls in dashboard content', () => {
    renderDashboardHeader({ variant: 'welcome' });

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Welcome back, Aster!');
    expect(screen.queryByText('Review placements, departments, and approvals.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select language' })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('places dashboard controls in one secondary bar below university branding', async () => {
    const { container } = renderGlobalDashboardHeader();

    expect(screen.getByRole('heading', { name: 'DEBRE TABOR UNIVERSITY' })).toBeInTheDocument();
    expect(container.querySelector('.dashboard-subheader')).toBeInTheDocument();
    expect(container.querySelector('.top-branding-tier .dashboard-header-navigation')).toBeNull();
    expect(container.querySelector('.dashboard-subheader .dashboard-header-navigation')).toBeInTheDocument();
    expect(container.querySelector('.navigation-tier')).toBeNull();
    expect(screen.getByRole('button', { name: 'Select language' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });

  it('submits current, new, and confirmed passwords to the password API', async () => {
    jest.spyOn(api, 'post').mockResolvedValue({
      data: { success: true, message: 'Password changed successfully.' },
    });
    renderDashboardHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Aster Gebre, aster@example.com' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change Password' }));
    expect(document.body.querySelector('.dashboard-modal-backdrop')).toBeInTheDocument();
    expect(document.querySelector('.main-header-container .dashboard-modal-backdrop')).toBeNull();
    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'new-password-123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'new-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/common/change_password.php', {
      current_password: 'old-password',
      new_password: 'new-password-123',
      confirm_password: 'new-password-123',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed successfully.');
  });

  it('toggles visibility for each Change Password field', () => {
    renderDashboardHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Aster Gebre, aster@example.com' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change Password' }));

    const currentPassword = screen.getByLabelText('Current Password');
    expect(currentPassword).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show current password' }));
    expect(currentPassword).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide current password' }));
    expect(currentPassword).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('New Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm New Password')).toHaveAttribute('type', 'password');
  });

  it('opens theme and language settings from the profile menu', () => {
    renderDashboardHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Aster Gebre, aster@example.com' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dashboard Settings' }));
    expect(screen.getByRole('dialog', { name: 'Dashboard Settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eye Care' }));
    expect(document.documentElement).toHaveClass('eye-care-mode');
    fireEvent.click(screen.getByRole('button', { name: 'አማርኛ' }));
    expect(localStorage.getItem('language')).toBe('am');
  });

  it('clears authentication and redirects to login when signing out', async () => {
    const postSpy = jest.spyOn(api, 'post').mockResolvedValue({ data: { success: true } });
    localStorage.setItem('token', 'session-token');
    sessionStorage.setItem('authToken', 'session-token');

    renderDashboardHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Aster Gebre, aster@example.com' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign Out' }));

    expect(await screen.findByText('Login destination')).toBeInTheDocument();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('authToken')).toBeNull();
    expect(postSpy).toHaveBeenCalledWith('auth/logout.php');
    postSpy.mockRestore();
  });
});
