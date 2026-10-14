import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DashboardHeader from './DashboardHeader.jsx';
import { LanguageProvider } from '../../contexts/LanguageContext.jsx';
import { ThemeProvider } from '../../contexts/ThemeContext.jsx';

const renderDashboardHeader = () => render(
  <ThemeProvider>
    <LanguageProvider>
      <DashboardHeader
        username="Aster"
        role="Registrar"
        subtitle="Review placements, departments, and approvals."
      />
    </LanguageProvider>
  </ThemeProvider>
);

describe('DashboardHeader', () => {
  beforeEach(() => {
    localStorage.removeItem('language');
    localStorage.removeItem('darkMode');
  });

  it('toggles and persists dark mode', () => {
    renderDashboardHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(document.documentElement).toHaveClass('dark-mode');
    expect(localStorage.getItem('darkMode')).toBe('true');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });

  it('switches dashboard labels and sidebar language preference to Amharic', () => {
    renderDashboardHeader();

    fireEvent.click(screen.getByRole('button', { name: 'አማ' }));

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('እንኳን ደህና መጡ, Aster!');
    expect(screen.getAllByText('ሬጅስትራር').length).toBeGreaterThan(0);
    expect(document.documentElement).toHaveAttribute('lang', 'am');
    expect(localStorage.getItem('language')).toBe('am');
  });
});
