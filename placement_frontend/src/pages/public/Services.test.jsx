import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Services from './Services.jsx';
import { AuthProvider } from '../../contexts/AuthContext.jsx';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const CurrentRoute = () => {
  const location = useLocation();
  return <output data-testid="current-route">{location.pathname}{location.search}</output>;
};

const renderServices = () => render(
  <MemoryRouter initialEntries={['/services']}>
    <AuthProvider>
      <Services />
      <CurrentRoute />
    </AuthProvider>
  </MemoryRouter>
);

describe('Services', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('replaces verification with the academic profile and status service', () => {
    renderServices();

    expect(screen.getByText('Academic Profile & Status Overview')).toBeInTheDocument();
    expect(screen.getAllByText('Profile & Status').length).toBeGreaterThan(0);
    expect(screen.queryByText('Verification')).not.toBeInTheDocument();
    expect(screen.getByText(/View your updated academic records/)).toBeInTheDocument();
    expect(screen.getByText(/Select, rank, and submit your top department choices/)).toBeInTheDocument();
    expect(screen.getByText(/Check your finalized department assignment/)).toBeInTheDocument();
    expect(screen.getByText(/Submit formal appeals or request corrections/)).toBeInTheDocument();
    expect(screen.getByText(/Explore course offerings, available capacities/)).toBeInTheDocument();
    expect(screen.getByText(/Review the 80\/20 merit quota policy/)).toBeInTheDocument();
  });

  test('routes a signed-in student directly to the selected service', () => {
    localStorage.setItem('user', JSON.stringify({ id: 12, role: 'student' }));
    renderServices();

    fireEvent.click(screen.getAllByRole('button', { name: /Access Service/ })[1]);

    expect(screen.getByTestId('current-route')).toHaveTextContent('/student-dashboard?tab=preferences');
  });

  test('prompts an unauthenticated visitor to log in and returns to the chosen service', async () => {
    api.post.mockResolvedValue({
      data: { status: 'success', user: { id: 12, role: 'student' } },
    });
    renderServices();

    fireEvent.click(screen.getAllByRole('button', { name: /Access Service/ })[2]);
    expect(screen.getByRole('dialog', { name: 'Portal Login' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Username or Email'), { target: { value: 'student@dtu.edu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'LOGIN' }));

    await waitFor(() => {
      expect(screen.getByTestId('current-route')).toHaveTextContent('/student-dashboard?tab=result');
    });
    expect(localStorage.getItem('activeTab')).toBe('result');
  });
});
