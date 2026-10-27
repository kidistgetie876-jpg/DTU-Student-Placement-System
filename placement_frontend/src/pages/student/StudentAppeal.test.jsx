import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentAppeal from './StudentAppeal';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('StudentAppeal', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: { success: true, appeals: [] } });
    api.post.mockResolvedValue({ data: { success: true, message: 'Appeal submitted.' } });
  });

  it('loads the student admission number from localStorage when no ID prop is provided', async () => {
    localStorage.setItem('user', JSON.stringify({
      admission_number: 'DTU16R2001',
      role: 'student',
    }));

    render(<StudentAppeal />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        'api/student/submit_appeal.php?admission_number=DTU16R2001',
      );
    });
  });

  it('submits both student ID and admission number when available', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: 15,
      admission_number: 'DTU16R2001',
      role: 'student',
    }));

    render(<StudentAppeal />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Complaint details' }), {
      target: { value: 'Please review my placement.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Appeal' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/student/submit_appeal.php', expect.objectContaining({
        student_id: 15,
        admission_number: 'DTU16R2001',
        subject: 'Placement appeal',
        message: 'Please review my placement.',
      }));
    });
  });

  it('uses the standalone student_id localStorage value in the request payload', async () => {
    localStorage.setItem('student_id', '23');

    render(<StudentAppeal />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Complaint details' }), {
      target: { value: 'Please review my placement.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Appeal' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/student/submit_appeal.php', expect.objectContaining({
        student_id: '23',
        subject: 'Placement appeal',
        message: 'Please review my placement.',
      }));
    });
  });

  it('includes the admission number as student_id when no numeric user ID is stored', async () => {
    localStorage.setItem('user', JSON.stringify({ admission_number: 'DTU16R2001', role: 'student' }));

    render(<StudentAppeal />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Complaint details' }), {
      target: { value: 'Please review my placement.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Appeal' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/student/submit_appeal.php', expect.objectContaining({
        student_id: 'DTU16R2001',
        admission_number: 'DTU16R2001',
      }));
    });
  });

  it('does not allow submission when no student identity is available', () => {
    render(<StudentAppeal />);

    expect(screen.getByRole('button', { name: 'Submit Appeal' })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
