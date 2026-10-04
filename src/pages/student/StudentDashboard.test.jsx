import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentDashboard from './StudentDashboard';
import api from '../../services/api.js';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('StudentDashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockNavigate.mockReset();

    localStorage.setItem('user', JSON.stringify({ id: '1', username: 'Alice', role: 'student' }));
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [{ id: 1, name: 'Computer Science', status: 'active' }] });
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

    expect(await screen.findByText(/Welcome, /i)).toBeInTheDocument();
    expect(screen.getByText(/GPA/i)).toBeInTheDocument();
    expect(screen.getByText(/Stream/i)).toBeInTheDocument();
    expect(screen.getByText('ID: 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit preferences/i }));

    expect(screen.getByText(/Rank Your Department Preferences/i)).toBeInTheDocument();
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
        return Promise.resolve({ data: [{ id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'Computational Sciences', status: 'active' }, { id: 2, name: 'Marketing', stream: 'Social Science', college_name: 'Business & Economics', status: 'active' }] });
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

    expect(screen.getAllByRole('combobox')[0]).toHaveValue('Natural');
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled();
    expect(screen.getByText('Registered Stream (Locked to your profile)')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Computational Sciences' })).toBeInTheDocument();
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

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getAllByRole('combobox')[0]).toHaveValue('Social');
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled();
  });

  it('renders and submits a preference slot for every department in the selected college', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const departments = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      name: `Technology Department ${index + 1}`,
      stream: 'Natural Science',
      college_name: 'Gafat Institute of Technology',
      status: 'active',
    }));
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: departments });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Gafat Institute of Technology' } });

    expect(await screen.findByText('Preference Rank #10')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(12);

    for (let index = 0; index < departments.length; index += 1) {
      fireEvent.change(screen.getAllByRole('combobox')[index + 2], {
        target: { value: departments[index].name },
      });
    }

    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/student_preferences.php',
      expect.objectContaining({ choices: expect.any(Array) })
    ));
    expect(api.post.mock.calls[0][1].choices).toHaveLength(10);
    expect(await screen.findByRole('status')).toHaveTextContent('Preferences saved successfully.');
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  }, 15000);

  it('shows only active colleges and departments and sizes preference slots from active departments', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({
          data: [
            { id: 1, name: 'Biology', stream: 'Natural Science', college_name: 'College of Science', status: 'active' },
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

    const collegeSelect = screen.getAllByRole('combobox')[1];
    expect(screen.getByRole('option', { name: 'College of Science' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'College of Engineering' })).not.toBeInTheDocument();
    fireEvent.change(collegeSelect, { target: { value: 'College of Science' } });

    expect(await screen.findByText('Preference Rank #1')).toBeInTheDocument();
    expect(screen.queryByText('Preference Rank #2')).not.toBeInTheDocument();
    const departmentSelect = screen.getAllByRole('combobox')[2];
    expect(screen.getByRole('option', { name: 'Biology' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Civil Engineering' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Mechanical Engineering' })).not.toBeInTheDocument();
    expect(departmentSelect).toBeInTheDocument();
  });

  it('shows preference validation errors in the page without a browser alert', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Natural' } });
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please select a college first.');
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('shows submitted preferences read-only without form controls', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering' },
          { id: 2, name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering' },
          { id: 3, name: 'Business Administration', stream: 'Social Science', college_name: 'College of Business' },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', email: 'alice@example.com', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [
          { id: 1, department: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering' },
          { id: 2, department: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering' },
        ] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getByText(/You have already submitted your department preferences/i)).toBeInTheDocument();
    expect(screen.getByText('Natural')).toBeInTheDocument();
    expect(screen.getAllByText('College of Engineering')).toHaveLength(3);
    expect(screen.getByText('Rank #1')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText('Rank #2')).toBeInTheDocument();
    expect(screen.getByText('Electrical Engineering')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^submit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo changes/i })).not.toBeInTheDocument();
  });

  it('locks preference submission after the configured deadline', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: { submissionDeadline: '2020-01-01' } } } });
      }
      if (url.includes('departments_api.php')) return Promise.resolve({ data: [] });
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: '', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The preference submission deadline closed on 2020-01-01.');
    expect(screen.getAllByRole('combobox').every((select) => select.disabled)).toBe(true);
    expect(screen.queryByRole('button', { name: /^submit$/i })).not.toBeInTheDocument();
  });

  it('marks previously submitted choices as recorded after the deadline', async () => {
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

    expect(await screen.findByText('Submission Closed (Recorded)')).toBeInTheDocument();
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
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: '', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: { success: true, choices: [] } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The preference submission deadline closed');

    currentDeadline = '2099-01-01';
    window.dispatchEvent(new Event('system-settings-updated'));

    await waitFor(() => {
      expect(screen.queryByText(/The preference submission deadline closed/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^submit$/i })).toBeEnabled();
    });
    const [streamSelect, collegeSelect] = screen.getAllByRole('combobox');
    expect(streamSelect).toBeDisabled();
    expect(streamSelect).toHaveValue('Natural');
    expect(collegeSelect).toBeEnabled();
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

    expect(await screen.findByText(/Welcome, /i)).toBeInTheDocument();
    expect(screen.getByText(/GPA/i)).toBeInTheDocument();
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
  });
});
