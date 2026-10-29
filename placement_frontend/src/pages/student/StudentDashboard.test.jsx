import React from 'react';
import { fireEvent, render as testingLibraryRender, screen, waitFor, within } from '@testing-library/react';
import StudentDashboard from './StudentDashboard';
import api from '../../services/api.js';
import { LanguageProvider } from '../../contexts/LanguageContext.jsx';
import { ThemeProvider } from '../../contexts/ThemeContext.jsx';
import { AuthProvider } from '../../contexts/AuthContext.jsx';

const mockNavigate = jest.fn();
let mockLocation = { pathname: '/student-dashboard', search: '' };

jest.mock('../../contexts/RolePermissionsContext.jsx', () => ({
  useRolePermissions: () => ({ isOpen: () => true }),
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}));

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    defaults: { baseURL: 'http://localhost:8888/student-placement/placement_backend/' },
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const render = (ui) => testingLibraryRender(
  <ThemeProvider>
    <LanguageProvider>
      <AuthProvider>{ui}</AuthProvider>
    </LanguageProvider>
  </ThemeProvider>,
);

describe('StudentDashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockNavigate.mockReset();
    mockLocation = { pathname: '/student-dashboard', search: '' };

    localStorage.setItem('user', JSON.stringify({ id: '1', username: 'Alice', role: 'student' }));
    api.get.mockImplementation((url, requestConfig) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [{ id: 1, name: 'Computer Science', status: 'active', offered_semester: 1 }] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });
  });

  it('shows the student overview and opens the preference form', async () => {
    render(<StudentDashboard />);

    expect(await screen.findAllByText(/Welcome, /i)).toHaveLength(1);
    expect(screen.getByText('CGPA')).toBeInTheDocument();
    expect(screen.getByText(/Stream/i)).toBeInTheDocument();
    expect(screen.getByText('Current placement status')).toBeInTheDocument();
    expect(screen.getByText('Student placement overview')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Disability' })).not.toBeInTheDocument();
    expect(screen.getByText(/ID:/)).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: /submit preferences/i }));

    expect(screen.getByText(/Rank Your Department Preferences/i)).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/student-dashboard',
      search: '?tab=preferences',
    });
  });

  it('restores the selected tab from the dashboard URL after a refresh', async () => {
    mockLocation = { pathname: '/student-dashboard', search: '?tab=preferences' };

    render(<StudentDashboard />);

    expect(await screen.findByText(/Rank Your Department Preferences/i)).toBeInTheDocument();
  });

  it('opens academic score details from an academic metric card', async () => {
    render(<StudentDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: 'View CGPA details' }));

    expect(await screen.findByRole('dialog', { name: 'Final Score Details' })).toBeInTheDocument();
  });

  it('opens placement results from the placement stage card', async () => {
    render(<StudentDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: 'View placement status' }));

    expect(await screen.findByRole('heading', { name: 'Placement Result' })).toBeInTheDocument();
  });

  it('moves a selected college choice to another rank and clears its previous rank', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', gpa: 3 } },
        });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    const firstChoice = await screen.findByRole('combobox', { name: 'Choice #1' });
    const secondChoice = screen.getByRole('combobox', { name: 'Choice #2' });
    const thirdChoice = screen.getByRole('combobox', { name: 'Choice #3' });

    fireEvent.change(firstChoice, { target: { value: 'health_science' } });
    fireEvent.change(secondChoice, { target: { value: 'git' } });
    fireEvent.change(thirdChoice, { target: { value: 'other_natural_science' } });

    expect(within(firstChoice).getByRole('option', { name: 'Gafat Institute of Technology' })).toBeEnabled();
    expect(within(firstChoice).getByRole('option', { name: 'Other Natural Science' })).toBeEnabled();

    fireEvent.change(firstChoice, { target: { value: 'git' } });

    expect(firstChoice).toHaveValue('git');
    expect(secondChoice).toHaveValue('');
    expect(thirdChoice).toHaveValue('other_natural_science');
  });

  it('unlocks allocated department choices for students pending second semester', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', id_number: 'DTU16R2004', username: 'Alice', status: 'Pending 2nd Semester', gpa: 3, cgpa: 3, stream: 'Social Science' } },
        });
      }
      if (url.includes('placement_status.php')) {
        return Promise.resolve({
          data: {
            success: true,
            active_semester: 1,
            is_choice_editable: false,
            isLocked: true,
            is_second_sem_choice_open: true,
            allocated_college: 'Other Social Science',
            allocated_group: 'other_social_science',
          },
        });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({
          data: {
            success: true,
            departments: [
              { id: 10, name: 'Economics', stream: 'Social Science', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
              { id: 11, name: 'Law', stream: 'Social Science', college_name: 'School of Law', placement_group: 'law', status: 'active', offered_semester: 2 },
            ],
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 1,
            activeSemester: 1,
            secondSemesterChoiceEligible: true,
            isSecondSemesterChoiceOpen: true,
            is_choice_editable: false,
            isLocked: true,
            placementExecuted: true,
            is_placed: true,
            allowedDepartments: [
              { id: 10, name: 'Economics', stream: 'Social Science', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
            ],
            choices: [],
          },
        });
      }
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByRole('combobox', { name: 'Choice #1' })).toBeEnabled();
    expect(screen.getAllByRole('option', { name: 'Economics' })).toHaveLength(2);
    expect(screen.getAllByRole('option', { name: 'Law' })).toHaveLength(2);
    expect(screen.queryByLabelText('College or placement group')).not.toBeInTheDocument();
    expect(screen.queryByText('The Semester 2 choice portal is closed. Your choices are locked.')).not.toBeInTheDocument();
    expect(screen.queryByText('Placement has already been processed. Choice editing is locked.')).not.toBeInTheDocument();
    expect(document.querySelector('.student-preferences-submit')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Update Preferences' })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('api/student/get_active_departments.php', expect.objectContaining({
      params: expect.objectContaining({
        semester: 2,
      }),
    }));
  });

  it('uses the active first semester form for editable students and shows no duplicate lock warnings', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', id_number: 'DTU16R2004', username: 'Alice', gpa: 3, stream: 'Social Science' } },
        });
      }
      if (url.includes('placement_status.php')) {
        return Promise.resolve({
          data: {
            success: true,
            status: 'Pending 2nd Semester',
            active_semester: 1,
            isLocked: true,
            is_choice_editable: true,
            allocated_college: 'Other Social Science',
            allocated_group: 'other_social_science',
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 1,
            activeSemester: 1,
            secondSemesterChoiceEligible: true,
            isSecondSemesterChoiceOpen: false,
            isLocked: true,
            message: 'Semester 2 choices are locked while Semester 1 is active for placement.',
            choices: [],
          },
        });
      }
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByRole('combobox', {
      name: 'Registered Stream (Locked to your profile)',
    })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Choice #1' })).toBeEnabled();
    expect(screen.queryByText('Semester 2 choices are locked while Semester 1 is active for placement.'))
      .not.toBeInTheDocument();
    expect(screen.queryByText('Placement has already been processed. Choice editing is locked.'))
      .not.toBeInTheDocument();
  });

  it('allows Pending 1st Semester students to submit while Semester 1 is active', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', gpa: 3 } },
        });
      }
      if (url.includes('placement_status.php')) {
        return Promise.resolve({
          data: {
            success: true,
            status: 'Pending 1st Semester',
            active_semester: 1,
            isLocked: true,
            is_choice_editable: false,
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 1,
            activeSemester: 1,
            isLocked: true,
            choices: [],
          },
        });
      }
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByRole('combobox', { name: 'Choice #1' })).toBeEnabled();
    expect(document.querySelector('.student-preferences-submit')).toBeEnabled();
  });

  it('keeps unplaced Pending 1st Semester students on Semester 1 when Semester 2 is active', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', gpa: 3 } },
        });
      }
      if (url.includes('placement_status.php')) {
        return Promise.resolve({
          data: {
            success: true,
            status: 'Pending 1st Semester',
            active_semester: 2,
            isLocked: true,
            is_choice_editable: false,
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 1,
            activeSemester: 2,
            isLocked: true,
            choices: [],
          },
        });
      }
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByRole('combobox', {
      name: 'Registered Stream (Locked to your profile)',
    })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Choice #1' })).toBeEnabled();
    expect(screen.queryByText(
      'Semester 1 choices are locked while Semester 2 is active for placement.',
    )).not.toBeInTheDocument();
    expect(document.querySelector('.student-preferences-submit')).toBeEnabled();
  });

  it('opens Semester 2 preferences for students allocated during Semester 1 placement', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', username: 'Alice', stream: 'Social Science', gpa: 3 } },
        });
      }
      if (url.includes('placement_status.php')) {
        return Promise.resolve({
          data: {
            success: true,
            status: 'Placed in Semester 1',
            active_semester: 2,
            is_choice_editable: false,
            allocated_college: 'Other Social Science',
            allocated_group: 'other_social_science',
          },
        });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({
          data: {
            success: true,
            departments: [
              { id: 10, name: 'Economics', stream: 'Social Science', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
            ],
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 2,
            activeSemester: 2,
            secondSemesterChoiceEligible: true,
            isSecondSemesterChoiceOpen: true,
            choices: [],
          },
        });
      }
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByRole('combobox', { name: 'Choice #1' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Economics' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', {
      name: 'Registered Stream (Locked to your profile)',
    })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('api/student/get_active_departments.php', expect.objectContaining({
      params: expect.objectContaining({
        semester: 2,
      }),
    }));
  });

  it('allows a Pending student to edit choices even when placement results are still present', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', id_number: 'DTU16R2004', username: 'Alice', gpa: 3, stream: 'Social Science' } },
        });
      }
      if (url.includes('placement_status.php')) {
        return Promise.resolve({
          data: {
            success: true,
            status: 'Pending',
            active_semester: 1,
            isLocked: true,
            is_choice_editable: false,
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 1,
            activeSemester: 1,
            isLocked: true,
            placementExecuted: true,
            choices: [],
          },
        });
      }
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByRole('combobox', { name: 'Choice #1' })).toBeEnabled();
    expect(screen.queryByText('Placement has already been processed. Choice editing is locked.'))
      .not.toBeInTheDocument();
  });

  it('does not bypass a closed Registrar portal using a stale editability flag', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', id_number: 'DTU16R2004', username: 'Alice', gpa: 3, stream: 'Social Science' } },
        });
      }
      if (url.includes('placement_status.php')) {
        return Promise.resolve({
          data: {
            success: true,
            status: 'Pending 2nd Semester',
            active_semester: 2,
            isLocked: false,
            is_choice_editable: true,
            is_second_sem_choice_open: false,
            allocated_college: 'Other Social Science',
            allocated_group: 'other_social_science',
          },
        });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({
          data: {
            success: true,
            departments: [
              { id: 10, name: 'Economics', stream: 'Social Science', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
            ],
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 2,
            activeSemester: 2,
            secondSemesterChoiceEligible: true,
            isSecondSemesterChoiceOpen: false,
            is_choice_editable: true,
            isLocked: false,
            message: '2nd Semester choice portal is currently closed.',
            choices: [],
            minimumChoices: 1,
          },
        });
      }
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByText('2nd Semester choice portal is currently closed.'))
      .toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Choice #1' })).toBeDisabled();
    expect(document.querySelector('.student-preferences-submit')).toBeDisabled();
  });

  it('uses the allocation to identify Semester 2 even when the saved status still says Semester 1 placed', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', id_number: 'DTU16R2004', username: 'Alice', gpa: 3, cgpa: 3, stream: 'Social Science' } },
        });
      }
      if (url.includes('placement_status.php')) {
        return Promise.resolve({
          data: {
            success: true,
            status: 'Placed in Semester 1',
            active_semester: 2,
            second_sem_choice_eligible: false,
            isLocked: true,
            is_second_sem_choice_open: true,
            allocated_college: 'Other Social Science',
            allocated_group: 'other_social_science',
          },
        });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({
          data: {
            success: true,
            departments: [
              { id: 10, name: 'Economics', stream: 'Social Science', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
              { id: 12, name: 'Social Studies', stream: 'Social Science', college_name: 'College of Other Social Sciences', placement_group: 'other_social_science', status: 'active', offered_semester: 1, is_first_semester_only: 0 },
              { id: 13, name: 'First Semester Only', stream: 'Social Science', college_name: 'College of Other Social Sciences', placement_group: 'other_social_science', status: 'active', offered_semester: 1, is_first_semester_only: 1 },
            ],
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 2,
            activeSemester: 2,
            secondSemesterChoiceEligible: true,
            isSecondSemesterChoiceOpen: true,
            isLocked: true,
            placementExecuted: true,
            is_placed: true,
            message: '2nd Semester Department Choice Portal is OPEN. Please rank your preferences.',
            choices: [],
          },
        });
      }
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByText(
      '2nd Semester Department Choice Portal is OPEN. Please rank your preferences.',
    )).toHaveAttribute('role', 'status');
    expect(await screen.findByRole('combobox', { name: 'Choice #1' })).toBeEnabled();
    expect(screen.getAllByRole('option', { name: 'Social Studies' })).toHaveLength(2);
    expect(screen.queryByRole('option', { name: 'First Semester Only' })).not.toBeInTheDocument();
    expect(screen.queryByText('Placement has already been processed. Choice editing is locked.')).not.toBeInTheDocument();
  });

  it('locks preferences and hides update controls after placement has run', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 1,
            isLocked: true,
            choices: [{ dept_id: 1, dept_name: 'Biology', priority: 1 }],
          },
        });
      }
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByText(
      'Placement has already been processed. Choice editing is locked.',
    )).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: 'Update Preferences' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Updated Preferences' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Choice #1/ })).not.toBeInTheDocument();
  });

  it('rejects a broad group selection when other stream groups are not selected', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [{ id: 1, name: 'Biology', status: 'active', offered_semester: 1 }] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: {
            success: true,
            student: {
              id: '1',
              username: 'Alice',
              gpa: 3,
              cgpa: 3,
              stream: 'Natural Science',
            },
          },
        });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    fireEvent.change(await screen.findByRole('combobox', { name: 'Choice #3' }), {
      target: { value: 'other_natural_science' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please select a preference for every available college or placement group in your assigned stream.',
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('uses the database CGPA when the legacy GPA field is zero', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: 'DTU16R2001',
      id_number: 'DTU16R2001',
      username: 'Alice',
      role: 'student',
    }));
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: {
            success: true,
            student: { id: '1', username: 'Alice', gpa: 0, cgpa: '3.80', status: 'Active', stream: 'Natural Science' },
          },
        });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    expect(await screen.findByText('3.80')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    expect(screen.getByText(/Rank Your Department Preferences/i)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      'api/student/student_data_api.php?student_id=DTU16R2001&email=',
    );
  });

  it('removes the profile tab from the dashboard navigation and views', async () => {
    render(<StudentDashboard />);

    expect(await screen.findByRole('button', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Profile & Preferences' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Student Profile' })).not.toBeInTheDocument();
  });

  it('renders the student appeal form and appeal history view', async () => {
    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Appeal' }));

    expect(await screen.findByRole('heading', { name: 'Submit Appeal' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Subject' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Complaint details' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Appeals' })).toBeInTheDocument();
  });

  it('shows the calculated cumulative score when the student has no published placement yet', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: {
            success: true,
            student: {
              id: '1',
              username: 'Alice',
              gpa: 3.5,
              grade_12_result: 76,
              coc_result: 25,
              cumulative_avg: '75.20',
              status: 'Not assigned',
              department: 'Not assigned',
            },
          },
        });
      }
      if (url.includes('get_student_result.php')) {
        return Promise.resolve({
          data: {
            success: true,
            published: false,
            student: { id: 1, status: 'Not assigned', department: 'Not assigned' },
            placement: null,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);

    expect(await screen.findByText('75.20')).toBeInTheDocument();
  });

  it('fetches and shows the latest final score details when its overview card is clicked', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: {
            success: true,
            student: {
              id: '1',
              id_number: 'DTU16R1001',
              username: 'Alice',
              gpa: 3.5,
              grade_12_result: 76,
              coc_result: 25,
              cumulative_avg: '75.20',
              status: 'Not assigned',
              department: 'Not assigned',
              stream: 'Social',
            },
          },
        });
      }
      if (url.includes('get_student_result.php')) {
        return Promise.resolve({
          data: {
            success: true,
            published: false,
            student: { id: 1, status: 'Not assigned', department: 'Not assigned' },
            placement: null,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'View Final Score details' }));

    const dialog = await screen.findByRole('dialog', { name: 'Final Score Details' });
    expect(dialog).toHaveTextContent('75.20');
    expect(dialog).toHaveTextContent('Current cumulative score');
    expect(dialog).toHaveTextContent('Grade 12 result');
    expect(api.get.mock.calls.filter(([url]) => url.includes('student_data_api.php'))).toHaveLength(2);
  });

  it('marks all student notifications as read', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('get_student_notifications.php')) {
        return Promise.resolve({
          data: {
            success: true,
            notifications: [{ id: 10, message: 'Placement update', is_read: '0' }],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true, message: 'All notifications marked as read.' } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }));

    expect(await screen.findByRole('button', { name: 'Mark all as read' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/student/mark_all_notifications_read.php'));
    expect(await screen.findByText('All notifications marked as read.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('marks an individual student notification as read', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('get_student_notifications.php')) {
        return Promise.resolve({
          data: {
            success: true,
            notifications: [{ id: 11, message: 'New placement notice', is_read: 0 }],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true, message: 'Notification marked as read.' } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }));

    const markReadButton = await screen.findByRole('button', { name: 'Mark as read' });
    fireEvent.click(markReadButton);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/mark_notification_read.php',
      { notification_id: 11 }
    ));
    expect(await screen.findByText('Notification marked as read.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument();
  });

  it('shows registrar meeting notifications with their date, time, and location', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('get_student_notifications.php')) {
        return Promise.resolve({
          data: {
            success: true,
            notifications: [{
              id: 21,
              notification_type: 'meeting',
              title: 'Unassigned student meeting',
              message: 'Please attend to discuss remediation options.',
              meeting_date: '2026-10-20',
              meeting_time: '09:30:00',
              location: 'Registrar Office',
              is_read: 0,
            }],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }));

    expect(await screen.findByText('Unassigned student meeting')).toBeInTheDocument();
    expect(screen.getByText('Please attend to discuss remediation options.')).toBeInTheDocument();
    expect(screen.getByText('2026-10-20')).toBeInTheDocument();
    expect(screen.getByText('09:30:00')).toBeInTheDocument();
    expect(screen.getByText('Registrar Office')).toBeInTheDocument();
  });

  it('opens notification attachments through the authorized download endpoint', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('get_student_notifications.php')) {
        return Promise.resolve({
          data: {
            success: true,
            notifications: [{
              id: 23,
              title: 'Placement letter',
              file_path: 'uploads/reports/placement letter.pdf',
              is_read: 1,
            }],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }));

    const attachment = await screen.findByRole('link', { name: 'Open attachment' });
    expect(attachment).toHaveAttribute(
      'href',
      'http://localhost:8888/student-placement/placement_backend/api/common/download_report.php?notification_id=23',
    );
    expect(attachment).toHaveAttribute('target', '_blank');
    expect(attachment).toHaveAttribute('rel', 'noopener noreferrer');
    expect(api.get.mock.calls.some(([url]) => String(url).includes('download_report.php'))).toBe(false);
  });

  it('marks a registrar meeting notification as read using its notification type', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('get_student_notifications.php')) {
        return Promise.resolve({
          data: {
            success: true,
            notifications: [{
              id: 22,
              notification_type: 'meeting',
              title: 'Unassigned student meeting',
              message: 'Please attend.',
              meeting_date: '2026-10-20',
              meeting_time: '09:30:00',
              location: 'Registrar Office',
              is_read: 0,
            }],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true, message: 'Notification marked as read.' } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as read' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/mark_notification_read.php',
      { notification_id: 22, notification_type: 'meeting' }
    ));
  });

  it('hides Pending placement details until the Registrar publishes the result', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      if (url.includes('get_student_result.php')) {
        return Promise.resolve({
          data: {
            success: false,
            published: false,
            message: 'Your placement result is currently under review.',
            placement: { assigned_department: 'Computer Science', placement_status: 'Pending' },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /placement result/i }));

    expect(await screen.findByText(/Placement Under Review/i)).toBeInTheDocument();
    expect(screen.queryByText('Computer Science')).not.toBeInTheDocument();
    expect(screen.queryByText(/Congratulations!/i)).not.toBeInTheDocument();
  });

  it('uses the latest placement result when the loaded profile still says unassigned', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: {
            success: true,
            student: { id: '1', username: 'Alice', gpa: 3, status: 'Not assigned', department: 'Not assigned' },
          },
        });
      }
      if (url.includes('get_student_result.php')) {
        return Promise.resolve({
          data: {
            success: true,
            published: true,
            student: { id: 1, status: 'Assigned', department: 'Computer Science' },
            placement: {
              assigned_department: 'Computer Science',
              stream: 'Natural',
              merit_score: 88.5,
              placement_status: 'Assigned',
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /placement result/i }));

    expect(await screen.findByText(/placement has been assigned successfully/i)).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.getByText('Full Name').closest('article')).toHaveTextContent('Alice');
    expect(screen.getByText('Student ID').closest('article')).toHaveTextContent('1');
    expect(screen.getByText('Merit Score').closest('article')).toHaveTextContent('88.50');
    expect(screen.queryByText(/currently unassigned/i)).not.toBeInTheDocument();
  });

  it('shows a pending second-semester status banner on the placement result', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', id_number: 'DTU16R1002', username: 'Alice', gpa: 3, cgpa: 3 } },
        });
      }
      if (url.includes('get_student_result.php')) {
        return Promise.resolve({
          data: {
            success: true,
            published: true,
            student: { id: 1, id_number: 'DTU16R1002', status: 'Pending 2nd Semester' },
            placement: { placement_status: 'Pending 2nd Semester', merit_score: 88.5 },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /placement result/i }));

    expect(await screen.findByText('Pending 2nd Semester')).toBeInTheDocument();
    expect(screen.getByText('Merit Score')).toBeInTheDocument();
  });

  it('uses the latest placement result when the loaded profile has an older assignment', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: {
            success: true,
            student: { id: '1', username: 'Alice', gpa: 3, status: 'Assigned', department: 'Computer Science' },
          },
        });
      }
      if (url.includes('get_student_result.php')) {
        return Promise.resolve({
          data: {
            success: true,
            published: false,
            student: { id: 1, status: 'Not assigned', department: 'Not assigned' },
            placement: null,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /placement result/i }));

    expect(await screen.findByText(/currently unassigned/i)).toBeInTheDocument();
    expect(screen.queryByText('Computer Science')).not.toBeInTheDocument();
  });

  it('treats a null department from the latest placement result as unassigned', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: {
            success: true,
            student: { id: '1', username: 'Alice', gpa: 3, status: 'Assigned', department: 'Computer Science' },
          },
        });
      }
      if (url.includes('get_student_result.php')) {
        return Promise.resolve({
          data: {
            success: true,
            published: false,
            student: { id: 1, status: 'Assigned', department: null },
            placement: null,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /placement result/i }));

    expect(await screen.findByText(/currently unassigned/i)).toBeInTheDocument();
    expect(screen.queryByText('Computer Science')).not.toBeInTheDocument();
  });

  it('shows the official ID number in the header when available', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: '1',
      id_number: 'DTU16R1002',
      username: 'Alice',
      role: 'student',
    }));

    render(<StudentDashboard />);

    expect(await screen.findByText('ID: DTU16R1002')).toBeInTheDocument();
  });

  it('locks the stream dropdown to the student registered stream', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [{ id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'Computational Sciences', status: 'active', offered_semester: 1 }, { id: 2, name: 'Marketing', stream: 'Social Science', college_name: 'Business & Economics', status: 'active', offered_semester: 1 }] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', email: 'alice@example.com', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getByDisplayValue('Natural')).toBeDisabled();
    expect(screen.getByText('Registered Stream')).toBeInTheDocument();
    expect(screen.getByLabelText('Choice #1')).toHaveTextContent('Other Natural Science');
  });

  it('preselects and locks Social for a student registered in Social Science', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Social Science', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getByDisplayValue('Social')).toBeDisabled();
  });

  it('uses the verified stream returned by the student preferences API when profile data is missing', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Medicine', stream: 'Natural Science', college_name: 'Health Science', placement_group: 'health_science', status: 'active', offered_semester: 1 },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice' } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, assignedStream: 'Natural Science', choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getByDisplayValue('Natural')).toBeDisabled();
    expect(screen.getAllByRole('option', { name: 'Health Science' }).length).toBeGreaterThan(0);
  });

  it('renders dynamic Natural Science group rankings with department choices for Health Science and GIT', async () => {
    const departments = [
      { id: 1, name: 'Medicine', stream: 'Natural Science', college_name: 'Health Science', placement_group: 'health_science', status: 'active', offered_semester: 1 },
      { id: 2, name: 'Pharmacy', stream: 'Natural Science', college_name: 'Health Science', placement_group: 'health_science', status: 'active', offered_semester: 1 },
      { id: 7, name: 'Public Health', stream: 'Natural Science', college_name: 'Health Science', placement_group: 'health_science', status: 'active', offered_semester: 1 },
      { id: 8, name: 'Zoology', stream: 'Natural Science', college_name: 'Health Science', placement_group: 'health_science', status: ' Active ', offered_semester: 1 },
      { id: 3, name: 'Information Technology', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', placement_group: 'git', status: 'active', offered_semester: 1 },
      { id: 4, name: 'Computer Science', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', placement_group: 'git', status: 'active', offered_semester: 1 },
      { id: 5, name: 'Biology', stream: 'Natural Science', college_name: 'Other Natural Science', placement_group: 'other_natural_science', status: 'active', offered_semester: 1 },
      { id: 6, name: 'Law', stream: 'Social Science', college_name: 'School of Law', placement_group: 'law', status: 'active', offered_semester: 1 },
    ];
    api.get.mockImplementation((url, requestConfig) => {
      if (url.includes('departments_api.php')) {
        const preferenceCollege = requestConfig?.params?.preference_college;
        const matchingDepartments = preferenceCollege
          ? departments.filter((department) => (
            department.college_name === preferenceCollege
            && String(department.status).trim().toLowerCase() === 'active'
            && Number(department.offered_semester) === 1
          ))
          : departments;
        return Promise.resolve({ data: matchingDepartments });
      }
      if (url.includes('get_active_departments.php')) {
        const collegeName = requestConfig?.params?.college_name;
        return Promise.resolve({
          data: {
            departments: departments.filter((department) => department.college_name === collegeName),
          },
        });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science' } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, assignedStream: 'Natural Science', semester: 1, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    ['Health Science', 'Gafat Institute of Technology', 'Other Natural Science'].forEach((college) => {
      expect(screen.getAllByRole('option', { name: college })).toHaveLength(3);
    });
    expect(screen.queryByRole('option', { name: 'Law' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Choice #1'), { target: { value: 'health_science' } });
    await screen.findByLabelText('Choice #1a Department');
    expect(screen.getByLabelText('Choice #1c Department')).toBeInTheDocument();
    expect(screen.getByLabelText('Choice #1d Department')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('get_active_departments.php'),
      expect.objectContaining({
        params: expect.objectContaining({ college_name: 'Health Science', status: 'active' }),
      }),
    );
    expect(screen.getAllByRole('option', { name: 'Medicine' })).toHaveLength(4);
    expect(screen.getAllByRole('option', { name: 'Pharmacy' })).toHaveLength(4);
    fireEvent.change(screen.getByLabelText('Choice #1a Department'), { target: { value: 'Medicine' } });
    expect(screen.getByLabelText('Choice #1b Department')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Choice #1b Department'), { target: { value: 'Pharmacy' } });
    fireEvent.change(screen.getByLabelText('Choice #1c Department'), { target: { value: 'Public Health' } });
    fireEvent.change(screen.getByLabelText('Choice #1d Department'), { target: { value: 'Zoology' } });
    expect(screen.getByLabelText('Choice #1a Department').querySelector('option[value="Medicine"]')).toBeEnabled();
    expect(screen.getByLabelText('Choice #1b Department').querySelector('option[value="Medicine"]')).toBeDisabled();
    expect(screen.getByLabelText('Choice #1a Department')).toHaveValue('Medicine');
    expect(screen.getByLabelText('Choice #1b Department')).toHaveValue('Pharmacy');
    fireEvent.change(screen.getByLabelText('Choice #1b Department'), { target: { value: '' } });
    expect(screen.getByLabelText('Choice #1a Department').querySelector('option[value="Pharmacy"]')).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Choice #2'), { target: { value: 'git' } });
    await screen.findByLabelText('Choice #2a Department');
    expect(screen.getAllByRole('option', { name: 'Information Technology' })).toHaveLength(2);
    expect(screen.getAllByRole('option', { name: 'Computer Science' })).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Choice #2a Department'), { target: { value: 'Computer Science' } });
    expect(screen.getByLabelText('Choice #2b Department')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Choice #2b Department'), { target: { value: 'Information Technology' } });
    expect(screen.getByLabelText('Choice #2b Department').querySelector('option[value="Information Technology"]')).toBeEnabled();
    expect(screen.getByLabelText('Choice #2a Department').querySelector('option[value="Information Technology"]')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Choice #2b Department'), { target: { value: '' } });
    expect(screen.getByLabelText('Choice #2a Department').querySelector('option[value="Information Technology"]')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Choice #3'), { target: { value: 'other_natural_science' } });
    expect(screen.getByText(/broad group is submitted as one preference/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Biology' })).not.toBeInTheDocument();
  });

  it('refreshes the department catalog when the student opens preferences and reflects Registrar status changes on return', async () => {
    const departments = [
      { id: 1, name: 'Medicine', stream: 'Natural Science', college_name: 'Health Science', status: 'active', offered_semester: '1' },
      { id: 2, name: 'Pharmacy', stream: 'Natural Science', college_name: 'Health Science', status: 'active', offered_semester: '1' },
    ];
    api.get.mockImplementation((url, requestConfig) => {
      if (url.includes('get_active_departments.php')) {
        const collegeName = requestConfig?.params?.college_name;
        return Promise.resolve({
          data: {
            departments: departments.filter((department) => (
              department.college_name === collegeName
              && String(department.status).trim().toLowerCase() === 'active'
              && Number(department.offered_semester) === 1
            )),
          },
        });
      }
      if (url.includes('departments_api.php')) {
        const preferenceCollege = requestConfig?.params?.preference_college;
        return Promise.resolve({
          data: preferenceCollege
            ? departments.filter((department) => (
              department.college_name === preferenceCollege
              && department.status === 'active'
              && department.offered_semester === '1'
            ))
            : departments,
        });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science' } } });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('api/common/departments_api.php', {
      params: { status: 'active' },
    }));
    fireEvent.change(screen.getByLabelText('Choice #1'), { target: { value: 'health_science' } });
    await screen.findByLabelText('Choice #1b Department');
    fireEvent.change(screen.getByLabelText('Choice #1a Department'), { target: { value: 'Medicine' } });
    expect(screen.getByLabelText('Choice #1b Department')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Choice #1b Department'), { target: { value: 'Pharmacy' } });
    expect(screen.getByLabelText('Choice #1b Department')).toHaveValue('Pharmacy');

    departments[0].status = 'inactive';
    fireEvent.focus(window);

    await waitFor(() => {
      expect(screen.queryByLabelText('Choice #1b Department')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Choice #1a Department')).toHaveValue('Pharmacy');
    });
    expect(api.get.mock.calls.filter(([url, config]) => (
      url.includes('get_active_departments.php')
      && config?.params?.college_name === 'Health Science'
    ))).toHaveLength(2);
  });

  it('renders one sub-choice per active first-semester department returned by the API', async () => {
    const activeDepartments = [
      'Anesthesia', 'Nursing', 'MLS', 'Midwifery', 'Physiotherapy',
      'Radiology', 'Optometry', 'Public Health', 'Nutrition', 'Emergency Medicine',
    ].map((name, index) => ({
      id: index + 1,
      name,
      stream: 'Natural Science',
      college_name: 'Health Science',
      ...(index === 0 ? { placement_group: 'other_natural_science' } : {}),
      status: index === 0 ? 'ACTIVE' : 'active',
      offered_semester: '1',
    }));
    const departments = [
      ...activeDepartments,
      { id: 11, name: 'Medicine', stream: 'Natural Science', college_name: 'Health Science', status: 'inactive', offered_semester: 1 },
      { id: 12, name: 'Pharmacy', stream: 'Natural Science', college_name: 'Health Science', status: 'active', offered_semester: 2 },
      { id: 13, name: 'Dentistry', stream: 'Natural Science', college_name: 'Health Science', status: 'active' },
    ];
    api.get.mockImplementation((url, requestConfig) => {
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({ data: { departments: activeDepartments } });
      }
      if (url.includes('departments_api.php')) {
        const preferenceCollege = requestConfig?.params?.preference_college;
        return Promise.resolve({ data: preferenceCollege
          ? departments.filter((department) => department.college_name === preferenceCollege)
          : departments });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science' } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, assignedStream: 'Natural Science', semester: 1, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.change(screen.getByLabelText('Choice #1'), { target: { value: 'health_science' } });

    expect(await screen.findByLabelText('Choice #1j Department')).toBeInTheDocument();
    expect(screen.queryByLabelText('Choice #1k Department')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Medicine' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Pharmacy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Dentistry' })).not.toBeInTheDocument();
  });

  it('allows Social Science students to rank Law and Other Social Science', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({ data: { departments: [
          { id: 1, name: 'Law', stream: 'Social Science', college_name: 'School of Law', status: 'active', offered_semester: 1 },
        ] } });
      }
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Law', stream: 'Social Science', college_name: 'Law', placement_group: 'law', status: 'active', offered_semester: 1 },
          { id: 2, name: 'Economics', stream: 'Social Science', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 1 },
          { id: 3, name: 'Medicine', stream: 'Natural Science', college_name: 'Health Science', placement_group: 'health_science', status: 'active', offered_semester: 1 },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', id_number: 'DTU16R1001', username: 'Alice', stream: 'Social Science' } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, assignedStream: 'Social Science', semester: 1, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true, semester: 1, saved_count: 2 } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getAllByRole('option', { name: 'School of Law' })).toHaveLength(2);
    expect(screen.getAllByRole('option', { name: 'Other Social Science' })).toHaveLength(2);
    expect(screen.queryByRole('option', { name: 'Health Science' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Choice #1'), { target: { value: 'law' } });
    expect(screen.getByText('School of Law', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByLabelText('Choice #1 Department')).toHaveValue('');
    await screen.findByRole('option', { name: 'Law' });
    fireEvent.change(screen.getByLabelText('Choice #1 Department'), { target: { value: 'Law' } });
    expect(screen.queryByRole('option', { name: 'Economics' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choice #2'), { target: { value: 'other_social_science' } });
    expect(screen.getByText(/broad group is submitted as one preference/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Economics' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/student_preferences.php',
      {
        admission_number: 'DTU16R1001',
        student_id: '1',
        semester: 1,
        choices: [
          { dept_id: 1, priority: 1 },
          {
            dept_id: null,
            dept_name: 'Other Social Science',
            college_name: '',
            stream: 'Social Science',
            type: 'broad_group',
            priority: 2,
          },
        ],
      },
    ));

    fireEvent.click(await screen.findByRole('button', { name: 'Update Preferences' }));
    expect(screen.getByLabelText('Choice #1 Department')).toHaveValue('');
    await screen.findByRole('option', { name: 'Law' });
    expect(screen.getByLabelText('Choice #1 Department').querySelector('option[value="Law"]')).toBeEnabled();
    expect(screen.getByLabelText('Choice #1')).toHaveValue('law');
    expect(screen.getByLabelText('Choice #2')).toHaveValue('other_social_science');
  });

  it('shows Semester 2 preference options across colleges in the assigned stream', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', id_number: 'DTU16R1001', username: 'Alice', stream: 'Social Science' } } });
      }
      if (url.includes('placement_status.php')) {
        return Promise.resolve({
          data: {
            success: true,
            status: 'Placed in Semester 1',
            allocated_college: 'Other Social Science',
            allocated_group: 'other_social_science',
          },
        });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({
          data: {
            success: true,
            departments: [
              { id: 1, name: 'Law', stream: 'Social Science', college_name: 'School of Law', placement_group: 'law', status: 'active', offered_semester: 2 },
              { id: 2, name: 'Economics', stream: 'Social Science', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
              { id: 3, name: 'Sociology', stream: 'Social Science', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
              { id: 4, name: 'Medicine', stream: 'Natural Science', college_name: 'Health Science', placement_group: 'health_science', status: 'active', offered_semester: 2 },
            ],
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 2,
            activeSemester: 2,
            secondSemesterChoiceEligible: true,
            isSecondSemesterChoiceOpen: true,
            choices: [],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByText(
      'Semester 2 Preferences: Showing active departments across colleges in your assigned stream.',
    )).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Economics' })).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: 'Sociology' })).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: 'Law' })).toHaveLength(3);
    expect(screen.queryByRole('option', { name: 'Medicine' })).not.toBeInTheDocument();
    expect(screen.queryByText('College or placement group')).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('api/student/get_active_departments.php', expect.objectContaining({
      params: expect.objectContaining({
        semester: 2,
      }),
    }));
  });

  it('keeps students in Semester 1 when Semester 2 eligibility is missing', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: {
            success: true,
            student: { id: '1', id_number: 'DTU16R1001', username: 'Alice', stream: 'Social Science' },
          },
        });
      }
      if (url.includes('placement_status.php')) {
        return Promise.resolve({
          data: {
            success: true,
            status: 'Pending 2nd Semester',
            allocated_college: '',
            allocated_group: '',
          },
        });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({
          data: {
            success: true,
            departments: [
              { id: 1, name: 'Law', stream: 'Social Science', college_name: 'School of Law', placement_group: 'law', status: 'active', offered_semester: 2 },
              { id: 2, name: 'Economics', stream: 'Social Science', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
            ],
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 1,
            activeSemester: 2,
            secondSemesterChoiceEligible: false,
            isSecondSemesterChoiceOpen: false,
            assignedStream: 'Social Science',
            choices: [],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByRole('combobox', { name: 'Registered Stream (Locked to your profile)' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Choice #1' })
      .querySelector('option[value="other_social_science"]')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Economics' })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('api/student/get_active_departments.php', expect.anything());
  });

  it('allows same-stream department preferences across colleges in Semester 2', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', id_number: 'DTU16R1001', username: 'Alice', stream: 'Social Science' } } });
      }
      if (url.includes('placement_status.php')) {
        return Promise.resolve({
          data: {
            success: true,
            status: 'Pending 2nd Semester',
            allocated_college: 'Other Social Science',
            allocated_group: 'other_social_science',
          },
        });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({
          data: {
            success: true,
            departments: [
              { id: 1, name: 'Economics', stream: 'Social Science', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
              { id: 2, name: 'Sociology', stream: 'Social Science', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
              { id: 3, name: 'Law', stream: 'Social Science', college_name: 'School of Law', placement_group: 'law', status: 'active', offered_semester: 2 },
              { id: 4, name: 'Agriculture', stream: 'Natural Science', college_name: 'Agriculture', placement_group: 'other_natural_science', status: 'active', offered_semester: 2 },
            ],
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            semester: 2,
            activeSemester: 2,
            secondSemesterChoiceEligible: true,
            isSecondSemesterChoiceOpen: true,
            choices: [],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true, semester: 2, saved_count: 3 } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByRole('combobox', { name: 'Choice #1' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Choice #1' })).toBeEnabled();
    expect(screen.getByText(
      'Semester 2 Preferences: Showing active departments across colleges in your assigned stream.',
    )).toBeInTheDocument();
    expect(screen.queryByText(/active placement semester is/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Economics' })).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: 'Sociology' })).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: 'Law' })).toHaveLength(3);
    expect(screen.queryByRole('option', { name: 'Agriculture' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^-- Select department or college queue --$/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Choice #1'), { target: { value: 'department:1' } });
    fireEvent.change(screen.getByLabelText('Choice #2'), { target: { value: 'department:2' } });
    fireEvent.change(screen.getByLabelText('Choice #3'), { target: { value: 'department:3' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/student_preferences.php',
      {
        admission_number: 'DTU16R1001',
        student_id: '1',
        semester: 2,
        choices: [
          { dept_id: 1, priority: 1 },
          { dept_id: 2, priority: 2 },
          { dept_id: 3, priority: 3 },
        ],
      },
    ));
    expect(screen.getByText('Semester 2 preferences saved and verified (3 choices).'))
      .toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Update Preferences' }));
    expect(screen.getByLabelText('Choice #1')).toHaveValue('');
    expect(screen.getByLabelText('Choice #2')).toHaveValue('');
    expect(screen.getByLabelText('Choice #1').querySelector('option[value="department:1"]')).toBeEnabled();
    expect(screen.getByLabelText('Choice #2').querySelector('option[value="department:1"]')).toBeEnabled();
    expect(screen.getByLabelText('Choice #1').querySelector('option[value="department:2"]')).toBeEnabled();
    expect(screen.getByLabelText('Choice #2').querySelector('option[value="department:2"]')).toBeEnabled();
    expect(screen.getByLabelText('Choice #1').querySelector('option[value="department:3"]')).toBeEnabled();
  });

  it('uses Field of Study instead of a mismatched saved choice stream', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'Computational Sciences', status: 'active', offered_semester: 1 },
          { id: 2, name: 'Marketing', stream: 'Social Science', college_name: 'Business & Economics', status: 'active', offered_semester: 1 },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: {
            success: true,
            student: { id: '1', username: 'Alice', field_of_study: 'Social Science', stream: 'Natural Science', gpa: 3, cgpa: 3 },
          },
        });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({
          data: {
            success: true,
            choices: [{ department: 'Computer Science', stream: 'Natural', college_name: 'Computational Sciences' }],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    fireEvent.click(await screen.findByRole('button', { name: 'Update Preferences' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can only select departments within your assigned stream (Social Science / Natural Science).',
    );
    expect(api.post).not.toHaveBeenCalled();

    expect(screen.getByDisplayValue('Social')).toBeDisabled();
    expect(screen.getByLabelText('Choice #1')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Marketing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Computer Science' })).not.toBeInTheDocument();
  });

  it('accepts plural stream labels like Natural Sciences and Social Sciences', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Sciences', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getByDisplayValue('Natural')).toBeDisabled();
  });

  it('requires every stream group before submitting selected first-semester departments', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const departments = [
      { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', status: 'active', offered_semester: 1 },
      { id: 2, name: 'Information Technology', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', status: 'inactive' },
      { id: 3, name: 'Civil Engineering', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', status: 'active', offered_semester: 2 },
    ];
    api.get.mockImplementation((url, requestConfig) => {
      if (url.includes('departments_api.php')) {
        const preferenceCollege = requestConfig?.params?.preference_college;
        const matchingDepartments = preferenceCollege
          ? departments.filter((department) => (
            department.college_name === preferenceCollege
            && department.status === 'active'
            && Number(department.offered_semester ?? 1) === 1
          ))
          : departments;
        return Promise.resolve({ data: matchingDepartments });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', id_number: 'DTU16R1001', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({
          data: {
            departments: departments.filter((department) => (
              department.college_name === 'Gafat Institute of Technology'
              && department.status === 'active'
              && Number(department.offered_semester ?? 1) === 1
            )),
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.change(screen.getByLabelText('Choice #1'), { target: { value: 'git' } });
    await screen.findByLabelText('Choice #1a Department');
    expect(screen.getByLabelText('Choice #1a Department')).toBeInTheDocument();
    expect(screen.queryByLabelText('Choice #1b Department')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Information Technology' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choice #1a Department'), {
      target: { value: departments[0].name },
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please select a preference for every available college or placement group in your assigned stream.',
    );
    expect(api.post).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  }, 15000);

  it('shows only active colleges and records Other Natural Science as a broad first-semester preference', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({
          data: [
            { id: 1, name: 'Biology', stream: 'Natural Science', college_name: 'College of Science', status: 'active', offered_semester: 1 },
            { id: 2, name: 'Civil Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'inactive' },
            { id: 3, name: 'Mechanical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'inactive' },
          ],
        });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } },
        });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getAllByRole('option', { name: 'Other Natural Science' })).toHaveLength(3);
    expect(screen.queryByRole('option', { name: 'College of Engineering' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choice #1'), { target: { value: 'other_natural_science' } });

    expect(screen.getByText(/broad group is submitted as one preference/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Biology' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Civil Engineering' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Mechanical Engineering' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /submit preferences/i }).slice(-1)[0]).toBeEnabled();
  });

  it('shows preference validation errors in the page without a browser alert', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    api.get.mockImplementation((url) => {
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', stream: 'Natural Science' } } });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [{ id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active', offered_semester: 1 }] });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please select a preference for every available college or placement group in your assigned stream.',
    );
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('submits ranked first-semester choices across Natural Science groups with ordered priorities', async () => {
    const departments = [
      { id: '12', name: 'Medicine', stream: 'Natural Science', college_name: 'Health Science', status: 'active', offered_semester: 1 },
      { id: '13', name: 'Pharmacy', stream: 'Natural Science', college_name: 'Health Science', status: 'active', offered_semester: 1 },
      { id: '14', name: 'Computer Science', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', status: 'active', offered_semester: 1 },
      { id: '15', name: 'Information Technology', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', status: 'active', offered_semester: 1 },
      { id: '19', name: 'Biology', stream: 'Natural Science', college_name: 'Natural and Computational Sciences', status: 'active', offered_semester: 1 },
    ];
    api.get.mockImplementation((url, requestConfig) => {
      if (url.includes('departments_api.php')) {
        const preferenceCollege = requestConfig?.params?.preference_college;
        const matchingDepartments = preferenceCollege
          ? departments.filter((department) => department.college_name === preferenceCollege)
          : departments;
        return Promise.resolve({ data: matchingDepartments });
      }
      if (url.includes('get_active_departments.php')) {
        const preferenceCollege = requestConfig?.params?.college_name;
        return Promise.resolve({ data: { departments: departments.filter(
          (department) => department.college_name === preferenceCollege,
        ) } });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '42', id_number: 'DTU16R1042', username: 'Alice', stream: 'Natural Science' } } });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true, message: 'Preferences saved.' } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.change(screen.getByLabelText('Choice #1'), { target: { value: 'health_science' } });
    await screen.findByLabelText('Choice #1a Department');
    fireEvent.change(screen.getByLabelText('Choice #1a Department'), { target: { value: 'Medicine' } });
    fireEvent.change(screen.getByLabelText('Choice #1b Department'), { target: { value: 'Pharmacy' } });
    fireEvent.change(screen.getByLabelText('Choice #2'), { target: { value: 'git' } });
    await screen.findByLabelText('Choice #2a Department');
    fireEvent.change(screen.getByLabelText('Choice #2a Department'), { target: { value: 'Computer Science' } });
    fireEvent.change(screen.getByLabelText('Choice #2b Department'), { target: { value: 'Information Technology' } });
    fireEvent.change(screen.getByLabelText('Choice #3'), { target: { value: 'other_natural_science' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/student_preferences.php',
      expect.objectContaining({
        admission_number: 'DTU16R1042',
        student_id: '42',
        semester: 1,
        choices: expect.any(Array),
      }),
    ));
    const submittedChoices = api.post.mock.calls[0][1].choices;
    expect(submittedChoices).toHaveLength(5);
    expect(submittedChoices.map((choice) => choice.priority)).toEqual([1, 2, 3, 4, 5]);
  });

  it('shows a clear error and does not submit when a required preference choice is empty', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Medicine', stream: 'Natural Science', college_name: 'Health Science', status: 'active', offered_semester: 1 },
          { id: 2, name: 'Pharmacy', stream: 'Natural Science', college_name: 'Health Science', status: 'active', offered_semester: 1 },
        ] });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({ data: { departments: [
          { id: 1, name: 'Medicine', status: 'active', offered_semester: 1 },
          { id: 2, name: 'Pharmacy', status: 'active', offered_semester: 1 },
        ] } });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: 'DTU16R1001', username: 'Alice', id_number: 'DTU16R1001', stream: 'Natural Science' } } });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.change(screen.getByLabelText('Choice #1'), { target: { value: 'health_science' } });
    await screen.findByLabelText('Choice #1a Department');
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Rank every active department in Health Science before submitting.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('allows students to edit existing preferences even when saved data contains duplicates', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active', offered_semester: 1 },
          { id: 2, name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active', offered_semester: 1 },
          { id: 3, name: 'Mechanical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active', offered_semester: 1 },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '42', username: 'Alice', stream: 'Natural Science' } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: {
          success: true,
          choices: [1, 2, 3].map((priority) => ({
            dept_id: 1,
            department_name: 'Computer Science',
            college_name: 'College of Engineering',
            priority,
          })),
        } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Update Preferences' }));

    expect(await screen.findByText('You are editing your submitted preferences.')).toBeInTheDocument();
    expect(screen.queryByText('Each placement group can only be selected once.')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('submits an admission number when the profile has no numeric account ID', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: 'DTU16R2001',
      id_number: 'DTU16R2001',
      username: 'Alice',
      role: 'student',
    }));
    api.get.mockImplementation((url, requestConfig) => {
      if (url.includes('departments_api.php')) {
        const departments = [
          { id: 8, name: 'Biology', stream: 'Natural Science', college_name: 'College of Science', placement_group: 'other_natural_science', status: 'active', offered_semester: 1 },
          { id: 9, name: 'Medicine', stream: 'Natural Science', college_name: 'Health Science', placement_group: 'health_science', status: 'active', offered_semester: 1 },
          { id: 10, name: 'Computer Science', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', placement_group: 'git', status: 'active', offered_semester: 1 },
        ];
        const preferenceCollege = requestConfig?.params?.preference_college;
        return Promise.resolve({ data: preferenceCollege
          ? departments.filter((department) => department.college_name === preferenceCollege)
          : departments });
      }
      if (url.includes('get_active_departments.php')) {
        const preferenceCollege = requestConfig?.params?.college_name;
        const departments = [
          { id: 9, name: 'Medicine', college_name: 'Health Science', status: 'active', offered_semester: 1 },
          { id: 10, name: 'Computer Science', college_name: 'Gafat Institute of Technology', status: 'active', offered_semester: 1 },
        ];
        return Promise.resolve({ data: { departments: departments.filter((department) => department.college_name === preferenceCollege) } });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id_number: 'DTU16R2001', username: 'Alice', stream: 'Natural Science' } } });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.change(screen.getByLabelText('Choice #1'), { target: { value: 'health_science' } });
    fireEvent.change(await screen.findByLabelText('Choice #1a Department'), { target: { value: 'Medicine' } });
    fireEvent.change(screen.getByLabelText('Choice #2'), { target: { value: 'git' } });
    fireEvent.change(await screen.findByLabelText('Choice #2a Department'), { target: { value: 'Computer Science' } });
    fireEvent.change(screen.getByLabelText('Choice #3'), { target: { value: 'other_natural_science' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/student_preferences.php',
      expect.objectContaining({
        admission_number: 'DTU16R2001',
        student_id: 'DTU16R2001',
        semester: 1,
        choices: expect.any(Array),
      }),
    ));
    expect(api.post.mock.calls[0][1].choices).toHaveLength(3);
  });

  it('prevents saving edited preferences until all stream groups are selected', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', status: 'active', offered_semester: 1 },
          { id: 2, name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', status: 'active', offered_semester: 1 },
          { id: 3, name: 'Business Administration', stream: 'Social Science', college_name: 'College of Business', status: 'active', offered_semester: 1 },
        ] });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({ data: { departments: [
          { id: 1, name: 'Computer Science', status: 'active', offered_semester: 1 },
          { id: 2, name: 'Electrical Engineering', status: 'active', offered_semester: 1 },
        ] } });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', id_number: 'DTU16R1001', username: 'Alice', stream: 'Natural Science', email: 'alice@example.com', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: {
          success: true,
          isDeadlineActive: true,
          isResultPublished: false,
          choices: [
            { id: 1, department: 'Computer Science', stream: 'Natural Science', college_name: 'Gafat Institute of Technology' },
            { id: 2, department: 'Electrical Engineering', stream: 'Natural Science', college_name: 'Gafat Institute of Technology' },
          ],
        } });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getByText('Preferences submitted')).toBeInTheDocument();
    expect(screen.getByText('Preferences submitted. You can update or re-order your choices anytime until the placement results are published by the Registrar.')).toBeInTheDocument();
    expect(screen.getAllByRole('status')[0]).toHaveClass('bg-emerald-50', 'text-emerald-800', 'border-emerald-200');
    expect(screen.getByText('Natural')).toBeInTheDocument();
    expect(screen.getAllByText('Gafat Institute of Technology')).toHaveLength(3);
    expect(screen.getByText('Rank #1')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText('Rank #2')).toBeInTheDocument();
    expect(screen.getByText('Electrical Engineering')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update Preferences' }));
    expect(screen.getAllByRole('combobox')[1]).toBeEnabled();
    fireEvent.change(await screen.findByLabelText('Choice #1a Department'), { target: { value: 'Electrical Engineering' } });
    fireEvent.change(await screen.findByLabelText('Choice #1b Department'), { target: { value: 'Computer Science' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Updated Preferences' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please select a preference for every available college or placement group in your assigned stream.',
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('blocks saved preferences that are missing stream groups', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: { submissionDeadline: '2020-01-01' } } } });
      }
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', status: 'active', offered_semester: 1 },
          { id: 2, name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', status: 'active', offered_semester: 1 },
        ] });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({ data: { departments: [
          { id: 1, name: 'Computer Science', status: 'active', offered_semester: 1 },
          { id: 2, name: 'Electrical Engineering', status: 'active', offered_semester: 1 },
        ] } });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', id_number: 'DTU16R1001', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: {
          success: true,
          isDeadlineActive: true,
          is_published: false,
          deadline_passed: false,
          choices: [
            { id: 1, dept_id: 1, department: 'Computer Science', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', priority: 1 },
            { id: 2, dept_id: 2, department: 'Electrical Engineering', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', priority: 2 },
          ],
        } });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Update Preferences' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Updated Preferences' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Rank every active department in Gafat Institute of Technology before submitting.',
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('locks submitted preferences after the registrar publishes results and the preference window is closed', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering' },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', id_number: 'DTU16R1001', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: {
          success: true,
          isDeadlineActive: false,
          isResultPublished: true,
          choices: [{
            id: 1,
            department: 'Computer Science',
            dept_name: 'Computer Science',
            stream: 'Natural Science',
            college_name: 'College of Engineering',
          }],
        } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByText(
      'Preference submission is now closed because placement results have already been published.',
    )).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update Preferences' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    screen.getAllByRole('combobox').forEach((select) => expect(select).toBeDisabled());
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps preferences open while the configured submission window is active', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Medicine', stream: 'Natural Science', college_name: 'Health Science', status: 'active', offered_semester: 1 },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science' } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: {
          success: true,
          isDeadlineActive: true,
          isResultPublished: true,
          choices: [{ dept_id: 1, dept_name: 'Medicine', college_name: 'Health Science' }],
        } });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.queryByText(
      'Preference submission is now closed because placement results have already been published.',
    )).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Preferences' })).toBeEnabled();
  });

  it('requires complete stream group preferences when updating after the deadline', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: { submissionDeadline: '2020-01-01' } } } });
      }
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', status: 'active', offered_semester: 1 },
          { id: 2, name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', status: 'active', offered_semester: 1 },
        ] });
      }
      if (url.includes('get_active_departments.php')) {
        return Promise.resolve({ data: { departments: [
          { id: 1, name: 'Computer Science', status: 'active', offered_semester: 1 },
          { id: 2, name: 'Electrical Engineering', status: 'active', offered_semester: 1 },
        ] } });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', id_number: 'DTU16R1001', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: {
          success: true,
          isDeadlineActive: false,
          isResultPublished: false,
          choices: [
            { id: 1, dept_id: 1, department: 'Computer Science', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', priority: 1 },
            { id: 2, dept_id: 2, department: 'Electrical Engineering', stream: 'Natural Science', college_name: 'Gafat Institute of Technology', priority: 2 },
          ],
        } });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    fireEvent.click(await screen.findByRole('button', { name: 'Update Preferences' }));
    expect(screen.getAllByRole('combobox')[1]).toBeEnabled();
    const firstDepartmentChoice = await screen.findByLabelText('Choice #1a Department');
    const secondDepartmentChoice = await screen.findByLabelText('Choice #1b Department');
    expect(firstDepartmentChoice).toHaveValue('');
    expect(secondDepartmentChoice).toHaveValue('');
    expect(firstDepartmentChoice.querySelector('option[value="Computer Science"]')).toBeEnabled();
    expect(firstDepartmentChoice.querySelector('option[value="Electrical Engineering"]')).toBeEnabled();
    expect(secondDepartmentChoice.querySelector('option[value="Computer Science"]')).toBeEnabled();
    expect(secondDepartmentChoice.querySelector('option[value="Electrical Engineering"]')).toBeEnabled();
    fireEvent.change(firstDepartmentChoice, { target: { value: 'Computer Science' } });
    expect(secondDepartmentChoice.querySelector('option[value="Computer Science"]')).toBeDisabled();
    fireEvent.change(firstDepartmentChoice, { target: { value: 'Electrical Engineering' } });
    expect(secondDepartmentChoice.querySelector('option[value="Computer Science"]')).toBeEnabled();
    fireEvent.change(secondDepartmentChoice, { target: { value: 'Computer Science' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Updated Preferences' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please select a preference for every available college or placement group in your assigned stream.',
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows an active locked notice when no preferences were submitted before the deadline', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: { submissionDeadline: '2020-01-01' } } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, isDeadlineActive: false, isResultPublished: false, choices: [] } });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } } });
      }
      return Promise.resolve({ data: [] });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByText(/deadline closed on 2020-01-01/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^submit$/i })).not.toBeInTheDocument();
  });

  it('locks preference submission after the configured deadline', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: { submissionDeadline: '2020-01-01' } } } });
      }
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByText(/deadline closed on 2020-01-01/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^submit$/i })).not.toBeInTheDocument();
  });

  it('keeps previously submitted choices editable after the deadline until results are published', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: { submissionDeadline: '2020-01-01' } } } });
      }
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: '', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [
          { department: 'Computer Science', stream: 'Natural', college_name: 'Engineering' },
        ] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByText(/Preferences submitted\. You can update or re-order/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Preferences' })).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('unlocks the preference form when the deadline is extended', async () => {
    let currentDeadline = '2020-01-01';
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: { submissionDeadline: currentDeadline } } } });
      }
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    expect(await screen.findByText(/deadline closed on 2020-01-01/)).toBeInTheDocument();

    currentDeadline = '2099-01-01';
    window.dispatchEvent(new Event('system-settings-updated'));

    await waitFor(() => {
      expect(screen.queryByText(/The preference submission deadline closed/)).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]).toBeEnabled();
    });
    expect(screen.getByDisplayValue('Natural')).toBeDisabled();
    expect(screen.getByLabelText('Choice #1')).toBeEnabled();
  });

  it.each([
    ['below the minimum GPA', { gpa: 1.5, status: 'Active' }],
    ['marked NG', { gpa: 3, status: 'NG' }],
  ])('blocks preference submission when the student is %s', async (reason, academicRecord) => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({
          data: { success: true, student: { id: '1', username: 'Alice', cgpa: 3, ...academicRecord } },
        });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Placement Ineligibility Notice');
    expect(screen.getByRole('alert')).toHaveTextContent('minimum required placement threshold (1.75)');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^submit$/i })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not crash when the student profile GPA is missing', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: { departments: [] } });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: undefined } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);

    expect(await screen.findAllByText(/Welcome, /i)).toHaveLength(1);
    expect(screen.getByText(/GPA/i)).toBeInTheDocument();
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
  });
});
