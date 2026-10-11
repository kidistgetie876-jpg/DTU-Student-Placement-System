import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../services/api.js';
import UnassignedStudents from './UnassignedStudents.jsx';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('UnassignedStudents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loads and displays unassigned students', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        students: [{
          studentId: 4,
          idNumber: 'DTU-004',
          fullName: 'Aster Tesfaye',
          email: 'aster@example.edu',
          stream: 'Natural Science',
          college: 'College of Technology',
          status: 'Not assigned',
        }],
      },
    });

    render(<UnassignedStudents />);

    expect(await screen.findByText('Aster Tesfaye')).toBeInTheDocument();
    expect(screen.getByText('DTU-004')).toBeInTheDocument();
    expect(screen.getByText('aster@example.edu')).toBeInTheDocument();
    expect(screen.getByText('Natural Science')).toBeInTheDocument();
    expect(screen.getByText('College of Technology')).toBeInTheDocument();
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
  });

  test('submits meeting details and shows the success response', async () => {
    api.get.mockResolvedValue({ data: { success: true, students: [{ studentId: 4 }] } });
    api.post.mockResolvedValue({
      data: { success: true, message: 'Notification successfully sent to All 1 Unassigned Students' },
    });

    render(<UnassignedStudents />);

    await screen.findByRole('button', { name: /send meeting notifications \(1\)/i });
    fireEvent.change(screen.getByLabelText('Meeting date'), { target: { value: new Date().toISOString().slice(0, 10) } });
    fireEvent.change(screen.getByLabelText('Meeting time'), { target: { value: '09:30' } });
    fireEvent.change(screen.getByLabelText('Location or meeting link'), { target: { value: 'Registrar office' } });
    fireEvent.change(screen.getByLabelText('Additional message (optional)'), { target: { value: 'Please bring your transcript.' } });
    fireEvent.click(screen.getByRole('button', { name: /send meeting notifications \(1\)/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/registrar/unassigned_students_api.php', {
        meeting_date: new Date().toISOString().slice(0, 10),
        meeting_time: '09:30',
        location: 'Registrar office',
        message: 'Please bring your transcript.',
        target_type: 'all',
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Notification successfully sent to All 1 Unassigned Students');
  });

  test('sends the notification to only the selected unassigned student', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        students: [{
          studentId: 4,
          idNumber: 'DTU-004',
          fullName: 'Aster Tesfaye',
        }],
      },
    });
    api.post.mockResolvedValue({
      data: { success: true, message: 'Notification successfully sent to Aster Tesfaye' },
    });

    render(<UnassignedStudents />);

    await screen.findByRole('button', { name: /send meeting notifications \(1\)/i });
    fireEvent.change(screen.getByLabelText('Send target'), { target: { value: 'individual' } });
    fireEvent.change(screen.getByLabelText('Student'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Meeting date'), { target: { value: new Date().toISOString().slice(0, 10) } });
    fireEvent.change(screen.getByLabelText('Meeting time'), { target: { value: '09:30' } });
    fireEvent.change(screen.getByLabelText('Location or meeting link'), { target: { value: 'Registrar office' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Meeting Notification' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/registrar/unassigned_students_api.php', {
        meeting_date: new Date().toISOString().slice(0, 10),
        meeting_time: '09:30',
        location: 'Registrar office',
        message: '',
        target_type: 'individual',
        student_id: '4',
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Notification successfully sent to Aster Tesfaye');
  });

  test('manually assigns an unassigned student to a department with capacity', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          success: true,
          students: [{
            studentId: 4,
            idNumber: 'DTU-004',
            fullName: 'Aster Tesfaye',
            stream: 'Natural Science',
            status: 'Not assigned',
          }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          departments: [{ id: 3, name: 'Computer Science', available: 3 }],
        },
      })
      .mockResolvedValueOnce({ data: { success: true, students: [] } });
    api.post.mockResolvedValue({
      data: {
        success: true,
        message: 'Aster Tesfaye was assigned to Computer Science and is pending department approval.',
      },
    });

    render(<UnassignedStudents />);

    fireEvent.click(await screen.findByRole('button', { name: 'Manually Assign' }));
    expect(await screen.findByRole('option', { name: 'Computer Science (3 seats left)' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Assignment' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/registrar/assign_manual_student.php', {
        student_id: 4,
        department_id: 3,
      });
    });
    expect(await screen.findByText('Aster Tesfaye was assigned to Computer Science and is pending department approval.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manually Assign' })).not.toBeInTheDocument();
  });

  test('shows an error when loading the list fails', async () => {
    api.get.mockRejectedValue({ response: { data: { message: 'Registrar access is required' } } });

    render(<UnassignedStudents />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Registrar access is required');
  });

  test('reloads the unassigned list when a completed placement run refreshes it', async () => {
    api.get
      .mockResolvedValueOnce({ data: { success: true, students: [] } })
      .mockResolvedValueOnce({
        data: {
          success: true,
          students: [{
            studentId: 9,
            idNumber: 'DTU-009',
            fullName: 'Mekdes Alemu',
            email: 'mekdes@example.edu',
            stream: 'Social Science',
            college: 'College of Business',
            status: 'Not assigned',
          }],
        },
      });

    const { rerender } = render(<UnassignedStudents refreshToken={0} />);

    await screen.findByText('There are no unassigned students to display.');
    rerender(<UnassignedStudents refreshToken={1} />);

    expect(await screen.findByText('Mekdes Alemu')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
