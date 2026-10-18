import React from 'react';
import { fireEvent, render as testingLibraryRender, screen, waitFor } from '@testing-library/react';
import StudentDashboard from './StudentDashboard';
import api from '../../services/api.js';
import { LanguageProvider } from '../../contexts/LanguageContext.jsx';
import { ThemeProvider } from '../../contexts/ThemeContext.jsx';

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

const render = (ui) => testingLibraryRender(
  <ThemeProvider>
    <LanguageProvider>{ui}</LanguageProvider>
  </ThemeProvider>,
);

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

    expect(await screen.findAllByText(/Welcome, /i)).toHaveLength(1);
    expect(screen.getByText(/GPA/i)).toBeInTheDocument();
    expect(screen.getByText(/Stream/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Placement status' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Disability' })).not.toBeInTheDocument();
    expect(screen.getByText('ID: 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit preferences/i }));

    expect(screen.getByText(/Rank Your Department Preferences/i)).toBeInTheDocument();
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
            student: { id: '1', username: 'Alice', gpa: 0, cgpa: '3.80', status: 'Active' },
          },
        });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      if (url.includes('get_placement_settings.php')) return Promise.resolve({ data: { min_gpa: 1.75 } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(screen.getByText('3.80')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    expect(screen.queryByText(/currently unassigned/i)).not.toBeInTheDocument();
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

    expect(screen.getAllByRole('combobox')[0]).toHaveValue('Natural');
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

    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/student_preferences.php',
      expect.objectContaining({ choices: expect.any(Array) })
    ));
    expect(api.post.mock.calls[0][1].choices).toHaveLength(10);
    expect(await screen.findByText('Preferences saved successfully. You can update your choices anytime until the Registrar publishes the final results.')).toBeInTheDocument();
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Please select a college first.');
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('filters departments already selected in other preference choices and submits numeric IDs with ordered priorities', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: '12', name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
          { id: '14', name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
          { id: '19', name: 'Mechanical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '42', username: 'Alice', stream: 'Natural Science' } } });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { success: true, message: 'Preferences saved.' } });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'College of Engineering' } });

    const firstChoice = screen.getAllByRole('combobox')[1];
    fireEvent.change(firstChoice, { target: { value: 'Computer Science' } });
    expect(screen.getAllByRole('combobox')[2].querySelector('option[value="Computer Science"]')).toBeNull();

    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'Electrical Engineering' } });
    expect(screen.getAllByRole('combobox')[3].querySelector('option[value="Computer Science"]')).toBeNull();
    expect(screen.getAllByRole('combobox')[3].querySelector('option[value="Electrical Engineering"]')).toBeNull();
    fireEvent.change(screen.getAllByRole('combobox')[3], { target: { value: 'Mechanical Engineering' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/student_preferences.php',
      {
        student_id: '42',
        choices: [
          { dept_id: 12, priority: 1 },
          { dept_id: 14, priority: 2 },
          { dept_id: 19, priority: 3 },
        ],
      },
    ));
  });

  it('shows a clear error and does not submit when a required preference choice is empty', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
          { id: 2, name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: 'DTU16R1001', username: 'Alice', id_number: 'DTU16R1001', stream: 'Natural Science' } } });
      }
      if (url.includes('student_preferences.php')) return Promise.resolve({ data: { success: true, choices: [] } });
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'College of Engineering' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Computer Science' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Choice #2');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('rejects duplicate departments loaded from existing preference data', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
          { id: 2, name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
          { id: 3, name: 'Mechanical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
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

    expect(await screen.findByRole('alert')).toHaveTextContent('Each department can only be selected once');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('submits an admission number when the profile has no numeric account ID', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: 'DTU16R2001',
      id_number: 'DTU16R2001',
      username: 'Alice',
      role: 'student',
    }));
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 8, name: 'Biology', stream: 'Natural Science', college_name: 'College of Science', status: 'active' },
        ] });
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
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'College of Science' } });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Biology' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit Preferences' }).slice(-1)[0]);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/student_preferences.php',
      { student_id: 'DTU16R2001', choices: [{ dept_id: 8, priority: 1 }] },
    ));
  });

  it('allows editing submitted preferences while the deadline is active and results are unpublished', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
          { id: 2, name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
          { id: 3, name: 'Business Administration', stream: 'Social Science', college_name: 'College of Business', status: 'active' },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', email: 'alice@example.com', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: {
          success: true,
          isDeadlineActive: true,
          isResultPublished: false,
          choices: [
            { id: 1, department: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering' },
            { id: 2, department: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering' },
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
    expect(screen.getAllByText('College of Engineering')).toHaveLength(3);
    expect(screen.getByText('Rank #1')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText('Rank #2')).toBeInTheDocument();
    expect(screen.getByText('Electrical Engineering')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update Preferences' }));
    expect(screen.getAllByRole('combobox')[1]).toBeEnabled();
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'Electrical Engineering' } });
    fireEvent.change(screen.getAllByRole('combobox')[3], { target: { value: 'Computer Science' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Updated Preferences' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/student_preferences.php',
      { student_id: '1', choices: [{ dept_id: 2, priority: 1 }, { dept_id: 1, priority: 2 }] },
    ));
    expect(await screen.findByText('Preferences saved successfully. You can update your choices anytime until the Registrar publishes the final results.')).toBeInTheDocument();
    expect(screen.getByText(/Preferences saved successfully\./)).toHaveClass('bg-emerald-50', 'text-emerald-800', 'border-emerald-200');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('allows editing when the API confirms no placement results exist for this student', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: { submissionDeadline: '2020-01-01' } } } });
      }
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
          { id: 2, name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: {
          success: true,
          isDeadlineActive: true,
          is_published: false,
          deadline_passed: false,
          choices: [
            { id: 1, dept_id: 1, department: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering', priority: 1 },
            { id: 2, dept_id: 2, department: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', priority: 2 },
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

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/student_preferences.php',
      { student_id: '1', choices: [{ dept_id: 1, priority: 1 }, { dept_id: 2, priority: 2 }] },
    ));
  });

  it('locks submitted preferences after the registrar publishes placement results', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering' },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: {
          success: true,
          isDeadlineActive: true,
          isResultPublished: true,
          choices: [{ id: 1, department: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering' }],
        } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<StudentDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: /submit preferences/i }));

    expect(await screen.findByText('Placement choices are locked. Results have been published by the Registrar.')).toBeInTheDocument();
    expect(screen.getByText('Results Published')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update Preferences' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('allows updating submitted preferences after the deadline until results are published', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: { submissionDeadline: '2020-01-01' } } } });
      }
      if (url.includes('departments_api.php')) {
        return Promise.resolve({ data: [
          { id: 1, name: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
          { id: 2, name: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', status: 'active' },
        ] });
      }
      if (url.includes('student_data_api.php')) {
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: 'Natural Science', gpa: 3, cgpa: 3 } } });
      }
      if (url.includes('student_preferences.php')) {
        return Promise.resolve({ data: {
          success: true,
          isDeadlineActive: false,
          isResultPublished: false,
          choices: [
            { id: 1, dept_id: 1, department: 'Computer Science', stream: 'Natural Science', college_name: 'College of Engineering', priority: 1 },
            { id: 2, dept_id: 2, department: 'Electrical Engineering', stream: 'Natural Science', college_name: 'College of Engineering', priority: 2 },
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
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'Electrical Engineering' } });
    fireEvent.change(screen.getAllByRole('combobox')[3], { target: { value: 'Computer Science' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Updated Preferences' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/student/student_preferences.php',
      { student_id: '1', choices: [{ dept_id: 2, priority: 1 }, { dept_id: 1, priority: 2 }] },
    ));
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
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: '', gpa: 3, cgpa: 3 } } });
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
        return Promise.resolve({ data: { success: true, student: { id: '1', username: 'Alice', stream: '', gpa: 3, cgpa: 3 } } });
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

    expect(await screen.findAllByText(/Welcome, /i)).toHaveLength(1);
    expect(screen.getByText(/GPA/i)).toBeInTheDocument();
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
  });
});
