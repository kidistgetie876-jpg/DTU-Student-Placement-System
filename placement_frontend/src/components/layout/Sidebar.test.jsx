import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import { LanguageProvider } from '../../contexts/LanguageContext.jsx';
import { ThemeProvider } from '../../contexts/ThemeContext.jsx';
import { AuthProvider } from '../../contexts/AuthContext.jsx';
import DashboardHeader from './DashboardHeader.jsx';

jest.mock('../../contexts/RolePermissionsContext.jsx', () => ({
  useRolePermissions: () => ({ isOpen: () => true }),
}));

const renderSidebar = (props) => render(
  <ThemeProvider>
    <LanguageProvider>
      <Sidebar {...props} />
    </LanguageProvider>
  </ThemeProvider>
);

describe('Sidebar', () => {
  it.each([
    ['registrar', 'overview', 'Department Status'],
    ['admin', 'dashboard', 'Audit Logs / System Health'],
    ['head', 'capacity', 'Department Capacity'],
    ['student', 'result', 'Submit Appeal'],
  ])('renders the %s navigation with an active item and role-specific menu', (role, activeItem, menuItem) => {
    const onSelect = jest.fn();

    renderSidebar({ role, activeItem, onSelect });

    expect(screen.getByRole('button', { current: 'page' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: new RegExp(menuItem, 'i') })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(menuItem, 'i') }));
    expect(onSelect).toHaveBeenCalledWith(expect.any(String));
  });

  it('shows Contact Messages only in the Admin navigation', () => {
    const { rerender } = renderSidebar({ role: 'admin', activeItem: 'dashboard', onSelect: jest.fn() });
    expect(screen.getByRole('button', { name: /Contact Messages/i })).toBeInTheDocument();

    ['registrar', 'head', 'student'].forEach((role) => {
      rerender(
        <ThemeProvider>
          <LanguageProvider>
            <Sidebar role={role} activeItem="overview" onSelect={jest.fn()} />
          </LanguageProvider>
        </ThemeProvider>
      );
      expect(screen.queryByRole('button', { name: /Contact Messages/i })).not.toBeInTheDocument();
    });
  });

  it('keeps logout out of the registrar navigation', () => {
    renderSidebar({ role: 'registrar', activeItem: 'overview', onSelect: jest.fn() });

    expect(screen.queryByRole('button', { name: /log ?out|sign ?out/i })).not.toBeInTheDocument();
  });

  it('provides a dedicated Placement Settings destination for registrars', () => {
    const onSelect = jest.fn();
    renderSidebar({ role: 'registrar', activeItem: 'settings', onSelect });

    const settings = screen.getByRole('button', { name: 'Placement Settings' });
    expect(settings).toHaveAttribute('aria-current', 'page');
    fireEvent.click(settings);
    expect(onSelect).toHaveBeenCalledWith('settings');
  });

  it('places Placed Students immediately above Unassigned Students for registrars', () => {
    renderSidebar({ role: 'registrar', activeItem: 'overview', onSelect: jest.fn() });
    const labels = screen.getAllByRole('button').map((button) => button.textContent.trim());

    expect(labels.indexOf('Placed Students')).toBe(labels.indexOf('Unassigned Students') - 1);
  });

  it('does not show the Preferences page in the Department Head navigation', () => {
    renderSidebar({ role: 'head', activeItem: 'overview', onSelect: jest.fn() });

    expect(screen.queryByRole('button', { name: 'Preferences' })).not.toBeInTheDocument();
  });

  it('does not show the removed profile tab in the Student navigation', () => {
    renderSidebar({ role: 'student', activeItem: 'overview', onSelect: jest.fn() });

    expect(screen.queryByRole('button', { name: 'Profile & Preferences' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Appeal' })).toBeInTheDocument();
  });

  it('translates common sidebar labels when Amharic is selected', () => {
    localStorage.removeItem('language');
    render(
      <MemoryRouter>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <>
                <DashboardHeader username="Aster" role="Registrar" subtitle="" />
                <Sidebar role="registrar" activeItem="overview" onSelect={jest.fn()} />
              </>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select language' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'አማርኛ' }));

    expect(screen.getByRole('heading', { name: 'የሬጅስትራር ፖርታል' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'አጠቃላይ እይታ' })).toBeInTheDocument();
  });
});
