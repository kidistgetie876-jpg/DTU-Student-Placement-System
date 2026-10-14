import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from './App.js';
import Header from './components/layout/Header.jsx';
import Login from './pages/public/Login.jsx';
import StudentRegistration from './pages/registrar/StudentRegistration.jsx';
import {
  parseYesNo as parseRegistrarYesNo,
  filterStudentIdsForPlacement,
} from './pages/registrar/RegistrarDashboard.jsx';
import { parseYesNo as parseStudentYesNo } from './pages/student/StudentDashboard.jsx';
import api from './services/api';

jest.mock('./services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const CurrentRoute = () => {
  const location = useLocation();
  return <output data-testid="current-route">{location.pathname}</output>;
};

describe('Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('darkMode', 'true');
  });

  test('keeps non-auth storage values when the page loads', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>
    );

    expect(localStorage.getItem('darkMode')).toBe('true');
  });

  test('submits login and stores the user payload for a dynamic role', async () => {
    api.post.mockResolvedValue({
      data: {
        status: 'success',
        user: { id: 8, username: 'marta', email: 'marta@dtu.edu', role: 'head' },
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/username or email/i), {
      target: { value: 'marta' },
    });
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('auth/login.php', {
        username_or_email: 'marta',
        password: 'secret123',
      });
    });

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('user')).role).toBe('head');
    });
  });

  test('renders the login route inside the public header and footer shell', async () => {
    api.get.mockResolvedValue({ data: { settings: { maintenance: { enabled: false } } } });
    window.history.pushState({}, '', '/login');

    render(<App />);

    expect(await screen.findByRole('dialog', { name: /user login/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Log in' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Reset your password' })).toHaveAttribute('aria-selected', 'false');
    const navigation = screen.getByRole('navigation');
    for (const link of ['Home', 'Services', 'Placement Info', 'Announcements', 'Contact']) {
      expect(await within(navigation).findByRole('link', { name: link })).toBeInTheDocument();
    }
    expect(within(navigation).getByRole('button', { name: /^login$/i })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /let’s talk about your next step/i })).not.toBeInTheDocument();
  });

  test('opens the password reset tab from the login page', async () => {
    api.get.mockResolvedValue({ data: { settings: { maintenance: { enabled: false } } } });
    window.history.pushState({}, '', '/login');

    render(<App />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Reset your password' }));

    expect(screen.getByRole('tab', { name: 'Reset your password' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address', { selector: '#reset-email' })).toBeInTheDocument();
  });

  test('routes a registrar to the overview after login', async () => {
    api.post.mockResolvedValue({
      data: {
        status: 'success',
        user: { id: 9, username: 'registrar', email: 'registrar@dtu.edu', role: 'registrar' },
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
        <CurrentRoute />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/username or email/i), {
      target: { value: 'registrar' },
    });
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByTestId('current-route')).toHaveTextContent('/registrar-dashboard/overview');
    });
  });

  test('rejects an invalid email before sending the login request', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/username or email/i), {
      target: { value: 'marta@' },
    });
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByText('Please enter a valid email.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('shows the backend error for an invalid identifier', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Username not found.' } } });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/username or email/i), {
      target: { value: 'missing-user' },
    });
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByText('Please enter the correct email or username.')).toBeInTheDocument();
  });

  test('shows a password error for a combined credential failure', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Invalid email or password.' } } });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/username or email/i), {
      target: { value: 'samuel@gmail.com' },
    });
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByText('Please enter the correct password.')).toBeInTheDocument();
  });

  test('shows an email error when the backend reports an unknown email', async () => {
    api.post.mockRejectedValue({ response: { data: { code: 'INVALID_EMAIL' } } });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/username or email/i), {
      target: { value: 'samue1@gmail.com' },
    });
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByText('Please enter the correct email or username.')).toBeInTheDocument();
  });

  test('completes the password reset flow in the dedicated login page tab', async () => {
    api.post
      .mockResolvedValueOnce({ data: { message: 'Reset code sent.' } })
      .mockResolvedValueOnce({ data: { success: true, message: 'Password updated.' } });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Reset your password' }));
    expect(screen.getByRole('tab', { name: 'Reset your password' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'marta@dtu.edu' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset code/i }));

    expect(await screen.findByLabelText('Six-digit verification code')).toBeInTheDocument();
    expect(api.post).toHaveBeenNthCalledWith(1, 'auth/forgot_password.php', { email: 'marta@dtu.edu' });
    fireEvent.change(screen.getByLabelText('Six-digit verification code'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'updated123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'updated123' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText('Password updated.')).toBeInTheDocument();
    expect(api.post).toHaveBeenNthCalledWith(2, 'auth/reset_password.php', {
      email: 'marta@dtu.edu',
      code: '123456',
      newPassword: 'updated123',
    });
  });

  test('keeps the Contact header link when navigation settings omit it', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        settings: {
          navigation: [{ id: 'home', label: 'Home', enabled: true }],
        },
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <>
          <Header />
          <CurrentRoute />
        </>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: 'Contact' }));
    expect(screen.getByTestId('current-route')).toHaveTextContent('/contact');
  });

  test('navigates to the dedicated login route when no user is stored', async () => {
    localStorage.setItem('darkMode', 'true');

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <>
          <Header />
          <CurrentRoute />
        </>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /^login$/i }));
    expect(screen.getByTestId('current-route')).toHaveTextContent('/login');
    expect(screen.queryByRole('dialog', { name: /portal login/i })).not.toBeInTheDocument();
    expect(localStorage.getItem('darkMode')).toBe('true');
  });

  test('removes only the auth entry on logout and leaves other storage values intact', async () => {
    localStorage.setItem('darkMode', 'true');
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'alice', role: 'student' }));

    render(
      <MemoryRouter initialEntries={["/admin-dashboard"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <>
          <Header />
          <CurrentRoute />
        </>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    expect(localStorage.getItem('user')).toBeNull();
    expect(screen.getByTestId('current-route')).toHaveTextContent('/');
    expect(api.post).toHaveBeenCalledWith('auth/logout.php');
    expect(localStorage.getItem('darkMode')).toBe('true');
    expect(screen.queryByRole('dialog', { name: /portal login/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^login$/i })).toBeInTheDocument();
  });

  test('treats Yes and No strings as booleans instead of truthy strings', () => {
    expect(parseRegistrarYesNo('Yes')).toBe(true);
    expect(parseRegistrarYesNo('No')).toBe(false);
    expect(parseStudentYesNo('Yes')).toBe(true);
    expect(parseStudentYesNo('No')).toBe(false);
  });

  test('does not assign a department by default during registration', async () => {
    api.get.mockResolvedValue({
      data: {
        departments: [
          { name: 'Computer Science', stream: 'Natural Science' },
          { name: 'Management', stream: 'Social Science' },
        ],
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <StudentRegistration />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('api/common/departments_api.php');
    });

    expect(screen.getByRole('combobox', { name: /department/i })).toHaveValue('');
  });

  test('filters placement candidates to the selected student IDs before running the engine', () => {
    const records = [
      { id: 1, name: 'Alice', status: 'Pending' },
      { id: 2, name: 'Bob', status: 'Pending' },
      { id: 3, name: 'Cora', status: 'Pending' },
    ];

    expect(filterStudentIdsForPlacement(records, ['2', '3'])).toEqual([
      { id: 2, name: 'Bob', status: 'Pending' },
      { id: 3, name: 'Cora', status: 'Pending' },
    ]);

    expect(filterStudentIdsForPlacement(records, [])).toEqual(records);
  });
});
