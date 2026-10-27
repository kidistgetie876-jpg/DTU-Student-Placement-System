import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import api from '../../services/api.js';
import ResetStudentChoices from './ResetStudentChoices.jsx';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('ResetStudentChoices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('confirms and resets choices through the active-semester endpoint', async () => {
    api.post.mockResolvedValue({
      data: {
        success: true,
        semester: 2,
        choices_cleared: 12,
        message: 'Reset 12 student choice record(s) for Semester 2.',
      },
    });
    render(<ResetStudentChoices activeSemester={2} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Semester 2 Choices' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('active Semester 2'));
    expect(api.post).toHaveBeenCalledWith(
      'api/registrar/reset_active_student_choices.php',
      { confirmed: true, expectedSemester: 2 },
      { withCredentials: true },
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Reset 12 student choice record(s) for Semester 2.',
    );
  });

  it('does not call the reset endpoint when confirmation is declined', () => {
    window.confirm.mockReturnValue(false);
    render(<ResetStudentChoices activeSemester={1} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Semester 1 Choices' }));

    expect(api.post).not.toHaveBeenCalled();
  });

  it('surfaces reset failures without showing success feedback', async () => {
    api.post.mockRejectedValue({
      response: { data: { message: 'Active-semester choice reset is unavailable.' } },
    });
    render(<ResetStudentChoices activeSemester={1} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Semester 1 Choices' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Active-semester choice reset is unavailable.',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
