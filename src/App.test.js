import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
        identifier: 'marta',
        password: 'secret123',
      });
    });

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('user')).role).toBe('head');
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

  test('shows login when no user is stored', () => {
    localStorage.setItem('darkMode', 'true');

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Header />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument();
    expect(localStorage.getItem('darkMode')).toBe('true');
  });

  test('removes only the auth entry on logout and leaves other storage values intact', async () => {
    localStorage.setItem('darkMode', 'true');
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'alice', role: 'student' }));

    render(
      <MemoryRouter initialEntries={["/admin-dashboard"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Header />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    await waitFor(() => {
      expect(localStorage.getItem('user')).toBeNull();
    });
    expect(localStorage.getItem('darkMode')).toBe('true');
    expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument();
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
