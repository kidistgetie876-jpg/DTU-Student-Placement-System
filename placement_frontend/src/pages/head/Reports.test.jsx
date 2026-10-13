import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Reports from './Reports';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    defaults: { baseURL: 'http://localhost/student-placement/placement_backend' },
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('Reports attachment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({
      data: {
        success: true,
        reports: [{
          id: 1,
          direction: 'received',
          is_read: 0,
          sender_role: 'registrar',
          recipient_role: 'head',
          message: 'Please review this file.',
          created_at: '2026-10-13 10:00:00',
          file_path: 'http://localhost:3000/uploads/reports/report.xlsx',
          file_url: 'http://localhost:3000/uploads/reports/report.xlsx',
        }],
      },
    });
  });

  it('opens the attachment from Apache and does not trigger the report card click', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    render(<Reports leader={{ id: 7 }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open attachment' }));

    expect(openSpy).toHaveBeenCalledWith(
      'http://localhost/student-placement/placement_backend/uploads/reports/report.xlsx',
      '_blank',
      'noopener,noreferrer'
    );
    expect(api.post).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it('permanently clears report history after confirmation', async () => {
    api.post.mockResolvedValue({ data: { success: true, deleted_count: 1 } });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(<Reports leader={{ id: 7 }} />);
    await screen.findByText('Please review this file.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear History' })).toBeEnabled());
    fireEvent.click(await screen.findByRole('button', { name: 'Clear History' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Permanently delete all reports in your history? This cannot be undone.'
    );
    expect(api.post).toHaveBeenCalledWith('api/head/clear_head_report_history.php');
    expect(await screen.findByText('No reports have been sent or received.')).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
