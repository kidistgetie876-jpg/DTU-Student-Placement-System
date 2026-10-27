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
          reasonCode: 'CAPACITY_FULL',
          reasonDetails: { departments: ['Computer Science', 'Information Technology'] },
          totalScore: 74.25,
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
    expect(screen.getByText('Department Capacity Full')).toBeInTheDocument();
    expect(screen.getByText('Full selected departments: Computer Science, Information Technology')).toBeInTheDocument();
    expect(screen.getByText('Merit score: 74.25')).toBeInTheDocument();
    expect(screen.getByText('Department Capacity Full')).toHaveClass('bg-warning', 'text-dark');
  });

  test('compares the total placement score with the cut-off when score is the reason', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        students: [{
          studentId: 5,
          fullName: 'Birtukan Desta',
          reasonCode: 'LOW_SCORE',
          reasonDetails: {},
          totalScore: 61.5,
          cutoffScore: 65,
        }],
      },
    });

    render(<UnassignedStudents />);

    expect(await screen.findByText('Low Total Placement Score')).toBeInTheDocument();
    expect(screen.getByText('Total score: 61.5 / Cut-off: 65')).toBeInTheDocument();
    expect(screen.getByText('Low Total Placement Score')).toHaveClass('bg-danger');
  });

  test('maps a backend reason string when no reason code is present', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        students: [{
          studentId: 6,
          fullName: 'Saba Worku',
          reason: 'Capacity Full',
          reasonDetails: { departments: ['Law'] },
        }],
      },
    });

    render(<UnassignedStudents />);

    expect(await screen.findByText('Capacity Full')).toHaveClass('bg-warning', 'text-dark');
    expect(screen.getByText('Full selected departments: Law')).toBeInTheDocument();
  });

  test('shows the resolved college and backend unassignment explanation in the reason alert', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        students: [
          {
            studentId: 7,
            fullName: 'Hana Bekele',
            college_name: 'College of Health Science',
            college: 'Legacy College',
            reasonCode: 'NO_CHOICES',
            unassigned_reason: 'Did not submit department choices',
          },
          {
            studentId: 8,
            fullName: 'Dawit Abebe',
            reasonCode: 'NO_CHOICES',
            unassigned_reason: 'Did not submit department choices',
          },
        ],
      },
    });

    render(<UnassignedStudents />);

    expect(await screen.findByText('College of Health Science')).toBeInTheDocument();
    expect(screen.getByText('Did not submit department choices')).toHaveClass('unassigned-reason-alert');
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  test('shows the compact heading and does not render meeting notification controls', async () => {
    api.get.mockResolvedValue({ data: { success: true, students: [] } });

    render(<UnassignedStudents />);

    expect(await screen.findByText('There are no unassigned students to display.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unassigned Students', level: 1 })).toHaveClass('text-2xl', 'text-slate-800');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Unassigned Report' })).toBeInTheDocument();
    expect(screen.queryByText(/Student portal meeting notification/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Meeting date|Meeting time|Location or meeting link/i)).not.toBeInTheDocument();
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

  test('manually assigns an unlinked student by admission number', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          success: true,
          students: [{
            studentId: 'DTU16R2014',
            admissionNumber: 'DTU16R2014',
            idNumber: 'DTU16R2014',
            fullName: 'Marta Tesfaye',
            stream: 'Natural Science',
            accountLinked: false,
          }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          departments: [{ id: 3, name: 'Computer Science', available: 1 }],
        },
      })
      .mockResolvedValueOnce({ data: { success: true, students: [] } });
    api.post.mockResolvedValue({
      data: { success: true, message: 'Marta Tesfaye was assigned to Computer Science.' },
    });

    render(<UnassignedStudents />);

    expect(await screen.findByText('Portal account not linked')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manually Assign' }));
    await screen.findByRole('option', { name: 'Computer Science (1 seats left)' });
    expect(api.get).toHaveBeenNthCalledWith(2, 'api/registrar/assign_manual_student.php', {
      params: { admission_number: 'DTU16R2014' },
    });
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Assignment' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/registrar/assign_manual_student.php', {
        admission_number: 'DTU16R2014',
        department_id: 3,
      });
    });
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
