import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import { LanguageProvider } from '../../contexts/LanguageContext.jsx';
import { ThemeProvider } from '../../contexts/ThemeContext.jsx';
import DashboardHeader from './DashboardHeader.jsx';

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
    ['student', 'result', 'Submit Complaints / Help'],
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

  it('does not show the Preferences page in the Department Head navigation', () => {
    renderSidebar({ role: 'head', activeItem: 'overview', onSelect: jest.fn() });

    expect(screen.queryByRole('button', { name: 'Preferences' })).not.toBeInTheDocument();
  });

  it('translates common sidebar labels when Amharic is selected', () => {
    localStorage.removeItem('language');
    render(
      <MemoryRouter>
        <ThemeProvider>
          <LanguageProvider>
            <>
              <DashboardHeader username="Aster" role="Registrar" subtitle="" />
              <Sidebar role="registrar" activeItem="overview" onSelect={jest.fn()} />
            </>
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
