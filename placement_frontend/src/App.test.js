import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from './App.js';
import Header from './components/layout/Header.jsx';
import Login from './pages/public/Login.jsx';
import StudentRegistration from './pages/registrar/StudentRegistration.jsx';
import {
  parseYesNo as parseRegistrarYesNo,
  filterStudentIdsForPlacement,
  filterPlacementCandidates,
  getPlacementCandidateIneligibility,
  normalizePlacementCandidateChoices,
  getPlacementCollegeOptions,
  getPlacementStreamOptions,
  normalizePlacementStream,
} from './pages/registrar/RegistrarDashboard.jsx';
import { parseYesNo as parseStudentYesNo } from './pages/student/StudentDashboard.jsx';
import api from './services/api';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { defaultRolePermissions } from './permissions/roleFeatures.js';

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

const mockAppApiResponses = () => {
  api.get.mockImplementation((endpoint) => Promise.resolve({
    data: endpoint === 'api/common/role_permissions_api.php'
      ? { success: true, permissions: defaultRolePermissions }
      : { settings: { maintenance: { enabled: false } } },
  }));
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

  test('removes the student and staff login toggles', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'Staff Login' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Student Login' })).not.toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText('Admission ID / Email'), {
      target: { value: 'marta@dtu.edu' },
    });
    fireEvent.change(screen.getByLabelText('First Name / Password'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('auth/login.php', {
        email: 'marta@dtu.edu',
        password: 'secret123',
      }, {
        timeout: 15000,
      });
    });

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('user')).role).toBe('head');
    });
  });

  test('resets the login button after a timed-out request', async () => {
    api.post.mockRejectedValue({ code: 'ECONNABORTED' });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Admission ID / Email'), {
      target: { value: 'DTU16R2001' },
    });
    fireEvent.change(screen.getByLabelText('First Name / Password'), {
      target: { value: 'Abebe' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The login request timed out.');
    expect(screen.getByRole('button', { name: 'LOGIN' })).toBeEnabled();
    expect(api.post).toHaveBeenCalledWith('auth/login.php', {
      admission_number: 'DTU16R2001',
      given_name: 'Abebe',
    }, {
      timeout: 15000,
    });
  });

  test('renders the login route inside the public header without the footer', async () => {
    mockAppApiResponses();
    window.history.pushState({}, '', '/login');

    render(<App />);

    expect(await screen.findByLabelText('Admission ID / Email')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'SDPS' })).toBeInTheDocument();
    const navigation = screen.getByRole('navigation');
    for (const link of ['Home', 'Services', 'Placement Info', 'Announcements', 'Contact']) {
      expect(await within(navigation).findByRole('link', { name: link })).toBeInTheDocument();
    }
    expect(within(navigation).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(navigation).getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /let’s talk about your next step/i })).not.toBeInTheDocument();
  });

  test('renders the public footer for authenticated visitors', async () => {
    mockAppApiResponses();
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'student' }));
    window.history.pushState({}, '', '/');

    render(<App />);

    const footer = await screen.findByRole('contentinfo');
    expect(within(footer).getByText('Student Department Placement System (SDPS)')).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'Placement Info' })).toHaveAttribute('href', '/placement-info');
    expect(within(footer).getByRole('link', { name: 'Portal Login' })).toHaveAttribute('href', '/login');
    expect(within(footer).getByText('placement@dtu.edu.et')).toHaveAttribute('href', 'mailto:placement@dtu.edu.et');
    expect(within(footer).getByText('© 2026 Debre Tabor University. All Rights Reserved.')).toBeInTheDocument();
  });

  test('updates public navigation language immediately and persists the selection', async () => {
    mockAppApiResponses();
    window.history.pushState({}, '', '/login');

    render(<App />);

    const languageSelect = await screen.findByRole('combobox', { name: 'Select language' });
    fireEvent.change(languageSelect, { target: { value: 'am' } });

    expect(within(screen.getByRole('navigation')).getByRole('link', { name: 'መነሻ' })).toBeInTheDocument();
    expect(localStorage.getItem('language')).toBe('am');
    expect(document.documentElement).toHaveAttribute('lang', 'am');
  });

  test('opens the password reset tab from the login page', async () => {
    mockAppApiResponses();
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
    localStorage.setItem('activeTab', 'data-import');

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
        <CurrentRoute />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Admission ID / Email'), {
      target: { value: 'registrar@dtu.edu' },
    });
    fireEvent.change(screen.getByLabelText('First Name / Password'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByTestId('current-route')).toHaveTextContent('/registrar-dashboard/overview');
    });
    expect(localStorage.getItem('activeTab')).toBe('overview');
  });

  test('keeps registrar sidebar navigation on its dashboard routes', async () => {
    mockAppApiResponses();
    localStorage.setItem('user', JSON.stringify({
      id: 9,
      username: 'registrar',
      role: 'Registrar',
    }));
    window.history.pushState({}, '', '/registrar-dashboard');

    render(<App />);

    const studentInfoLink = await screen.findByRole('button', { name: 'Student Information' });
    await waitFor(() => {
      expect(window.location.pathname).toBe('/registrar-dashboard/overview');
    });

    fireEvent.click(studentInfoLink);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/registrar-dashboard/student-info');
    });
    expect(screen.getByRole('button', { name: 'Student Information' })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: 'Unassigned Students' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/registrar-dashboard/unassigned-students');
    });
    expect(screen.getByRole('button', { name: 'Unassigned Students' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Overview' })).not.toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('dialog', { name: /user login/i })).not.toBeInTheDocument();
  });

  test.each([
    ['admin', '/admin-dashboard', 'dashboard'],
    ['student', '/student-dashboard', 'overview'],
    ['head', '/head-dashboard', 'overview'],
    ['department_head', '/head-dashboard', 'overview'],
    ['hod', '/head-dashboard', 'overview'],
    ['coordinator', '/head-dashboard', 'overview'],
    ['head of department', '/head-dashboard', 'overview'],
  ])('routes a %s to its overview after login', async (role, expectedPath, expectedTab) => {
    api.post.mockResolvedValue({
      data: {
        status: 'success',
        user: { id: 10, username: role, email: `${role}@dtu.edu`, role },
      },
    });
    localStorage.setItem('activeTab', 'data-import');

    render(
      <MemoryRouter initialEntries={['/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
        <CurrentRoute />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Admission ID / Email'), {
      target: { value: `${role}@dtu.edu` },
    });
    fireEvent.change(screen.getByLabelText('First Name / Password'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByTestId('current-route')).toHaveTextContent(expectedPath);
    });
    expect(localStorage.getItem('activeTab')).toBe(expectedTab);
  });

  test('rejects an invalid email before sending the login request', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Admission ID / Email'), {
      target: { value: 'marta@' },
    });
    fireEvent.change(screen.getByLabelText('First Name / Password'), {
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

    fireEvent.change(screen.getByLabelText('Admission ID / Email'), {
      target: { value: 'missing-user' },
    });
    fireEvent.change(screen.getByLabelText('First Name / Password'), {
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

    fireEvent.change(screen.getByLabelText('Admission ID / Email'), {
      target: { value: 'samuel@gmail.com' },
    });
    fireEvent.change(screen.getByLabelText('First Name / Password'), {
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

    fireEvent.change(screen.getByLabelText('Admission ID / Email'), {
      target: { value: 'samue1@gmail.com' },
    });
    fireEvent.change(screen.getByLabelText('First Name / Password'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByText('Please enter the correct email or username.')).toBeInTheDocument();
  });

  test('completes the password reset flow from the login page dialog', async () => {
    api.post
      .mockResolvedValueOnce({ data: { success: true, message: 'Reset code sent.' } })
      .mockResolvedValueOnce({ data: { success: true, message: 'Password updated.' } });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Login />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Forgot Password?' }));
    fireEvent.change(screen.getByLabelText('Registered email address'), { target: { value: 'marta@dtu.edu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Request' }));

    expect(await screen.findByLabelText('Six-digit verification code')).toBeInTheDocument();
    expect(api.post).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:8888/student-placement/placement_backend/auth/forgot_password.php', { email: 'marta@dtu.edu' });
    fireEvent.change(screen.getByLabelText('Six-digit verification code'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'updated123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'updated123' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText('Password updated.')).toBeInTheDocument();
    expect(api.post).toHaveBeenNthCalledWith(2, 'auth/reset_password.php', {
      email: 'marta@dtu.edu',
      code: '123456',
      new_password: 'updated123',
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
        <AuthProvider>
          <>
            <Header />
            <CurrentRoute />
          </>
        </AuthProvider>
      </MemoryRouter>
    );

    const navigation = screen.getByRole('navigation');
    for (const label of ['Home', 'Placement Info', 'Announcements', 'Contact']) {
      expect(await within(navigation).findByRole('link', { name: label })).toBeInTheDocument();
    }
    fireEvent.click(await screen.findByRole('link', { name: 'Contact' }));
    expect(screen.getByTestId('current-route')).toHaveTextContent('/contact');
  });

  test('navigates to the dedicated login route when no user is stored', async () => {
    localStorage.setItem('darkMode', 'true');

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <>
            <Header />
            <CurrentRoute />
          </>
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: /^login$/i }));
    expect(screen.getByTestId('current-route')).toHaveTextContent('/login');
    expect(screen.queryByRole('dialog', { name: /portal login/i })).not.toBeInTheDocument();
    expect(localStorage.getItem('darkMode')).toBe('true');
  });

  test('removes only the auth entry when signing out from the profile menu', async () => {
    localStorage.setItem('darkMode', 'true');
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'alice', role: 'student' }));

    render(
      <MemoryRouter initialEntries={["/admin-dashboard"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <>
            <Header />
            <CurrentRoute />
          </>
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /alice/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign Out' }));

    expect(localStorage.getItem('user')).toBeNull();
    expect(screen.getByTestId('current-route')).toHaveTextContent('/login');
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('auth/logout.php'));
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

  test('normalizes Natural Science stream aliases for placement filters', () => {
    const selectedStream = normalizePlacementStream(' Natural Science ');

    expect(normalizePlacementStream('')).toBe('all');
    expect(normalizePlacementStream('natural_science')).toBe(selectedStream);
    expect(normalizePlacementStream('NaturalScience')).toBe(selectedStream);
    expect(normalizePlacementStream('Natural')).toBe(selectedStream);
    expect(normalizePlacementStream('Social')).toBe(normalizePlacementStream('Social Science'));
  });

  test('always provides default placement stream options before department data loads', () => {
    expect(getPlacementStreamOptions([])).toEqual(['Natural Science', 'Social Science']);
    expect(getPlacementStreamOptions([
      { stream: 'Natural', college: 'College of Agriculture' },
      { stream: 'Social Science', college: 'School of Law' },
    ])).toEqual(['Natural Science', 'Social Science']);
  });

  test('limits placement college options to the selected stream', () => {
    const departments = [
      { stream: 'Natural', college: 'College of Natural & Computational Sciences' },
      { stream: 'Natural Science', college: 'College of Agriculture' },
      { stream: 'Natural Science', college: 'College of Health Sciences' },
      { stream: 'Social', college: 'College of Business & Economics' },
      { stream: 'Social Science', college: 'School of Law' },
    ];

    expect(getPlacementCollegeOptions(departments, 'Natural Science')).toEqual([
      'College of Agriculture',
      'College of Health Sciences',
      'College of Natural & Computational Sciences',
    ]);
    expect(getPlacementCollegeOptions(departments, 'Social Science')).toEqual([
      'College of Business & Economics',
      'School of Law',
    ]);
  });

  test('filters candidates by both selected stream and college', () => {
    const students = [
      { id: 1, stream: 'Natural', choices: [{ dept_name: 'Agriculture', college_name: 'College of Agriculture' }] },
      { id: 2, stream: 'NaturalScience', choices: [{ dept_name: 'Medicine', college_name: 'College of Health Sciences' }] },
      { id: 3, stream: 'Social Science', choices: [{ dept_name: 'Medicine', college_name: 'College of Health Sciences' }] },
      { id: 4, stream: 'Natural Science', choices: [{ dept_name: 'Management', college_name: 'College of Business & Economics' }] },
      { id: 5, stream: 'Natural Science', choices: [] },
    ];
    const visibleCandidates = filterPlacementCandidates(
      students,
      'Natural Science',
      'College of Health Sciences',
    );

    expect(visibleCandidates.map((student) => student.id)).toEqual([2]);
    expect(visibleCandidates).toHaveLength(1);
  });

  test('excludes candidates without saved preferences and malformed choice rows', () => {
    const students = [
      { id: 1, stream: 'Natural Science', choices: [] },
      { id: 2, stream: 'Natural Science', choices: [{}] },
      { id: 3, stream: 'Natural Science', choices: [{ dept_name: 'Computer Science' }] },
    ];

    const visibleCandidates = filterPlacementCandidates(
      students,
      'Natural Science',
      'all',
    );

    expect(visibleCandidates.map((student) => student.id)).toEqual([3]);
  });

  test('maps semester-two choices and alternate department/rank fields for placement rows', () => {
    const candidate = normalizePlacementCandidateChoices({
      id: 21,
      choices: [{ dept_name: 'Old semester choice', priority: 1 }],
      semester_2_choices: [
        { department_name: 'Computer Science', choice_rank: 2 },
        { department: 'Information Technology', rank: 1 },
        { name: '', choice_order: 3 },
      ],
    }, 2);

    expect(candidate.choices).toEqual([
      expect.objectContaining({
        dept_name: 'Information Technology',
        department: 'Information Technology',
        priority: 1,
      }),
      expect.objectContaining({
        dept_name: 'Computer Science',
        department: 'Computer Science',
        priority: 2,
      }),
    ]);
    expect(candidate.semester_2_choices).toEqual(candidate.choices);
  });

  test('does not use semester-one choices when the semester-two choice list is explicitly empty', () => {
    const candidate = normalizePlacementCandidateChoices({
      id: 22,
      choices: [{ dept_name: 'Semester One Department', priority: 1 }],
      semester_2_choices: [],
    }, 2);

    expect(candidate.choices).toEqual([]);
    expect(filterPlacementCandidates([candidate], '', 'all')).toEqual([]);
  });

  test('marks candidates without scores, qualifying choices, or active-semester status as ineligible', () => {
    const savedChoice = [{ dept_name: 'Computer Science', priority: 1 }];

    expect(getPlacementCandidateIneligibility({
      choices: savedChoice,
      has_pending_college_allocation: true,
      placement_status: 'Pending 2nd Semester',
      cgpa: 0,
      g12: 0,
      coc: 0,
    }, 2)).toMatch(/score data is missing/i);
    expect(getPlacementCandidateIneligibility({
      choices: [],
      cgpa: 3,
    }, 1)).toMatch(/preferences/i);
    expect(getPlacementCandidateIneligibility({
      choices: savedChoice,
      placement_status: 'Pending 1st Semester',
      cgpa: 3,
    }, 2)).toBe('');
    expect(getPlacementCandidateIneligibility({
      choices: savedChoice,
      has_pending_college_allocation: false,
      placement_status: 'Pending 1st Semester',
      cgpa: 3,
    }, 2)).toBe('');
    expect(getPlacementCandidateIneligibility({
      choices: savedChoice,
      has_pending_college_allocation: true,
      placement_status: 'Inactive',
      cgpa: 3,
    }, 2)).toMatch(/not eligible/i);
    expect(getPlacementCandidateIneligibility({
      choices: savedChoice,
      placement_status: 'Pending 1st Semester',
      cgpa: 3,
    }, 1)).toBe('');
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

    expect(filterStudentIdsForPlacement(records, [])).toEqual([]);
  });
});
