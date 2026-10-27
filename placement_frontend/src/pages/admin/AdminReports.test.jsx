import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminReports from './AdminReports';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    defaults: { baseURL: 'http://127.0.0.1:8888/student-placement/placement_backend/' },
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('AdminReports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: { success: true, reports: [] } });
  });

  it('sends a selected attachment and the admin-to-registrar roles as multipart data', async () => {
    api.post.mockResolvedValue({ data: { success: true, message: 'Message sent.' } });

    render(<AdminReports />);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Please review this report.' } });
    const file = new File(['report contents'], 'annual_placement_report.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Attachment (optional)'), { target: { files: [file] } });

    expect(screen.getByText('Selected: annual_placement_report.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send to Registrar' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/admin/send_message.php',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ));

    const formData = api.post.mock.calls[0][1];
    expect(formData.get('message')).toBe('Please review this report.');
    expect(formData.get('sender_role')).toBe('admin');
    expect(formData.get('recipient_role')).toBe('registrar');
    expect(formData.get('file')).toBe(file);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it('rejects attachments larger than the server limit before sending', () => {
    render(<AdminReports />);

    const oversizedFile = new File(
      [new Uint8Array(10 * 1024 * 1024 + 1)],
      'large_report.pdf',
      { type: 'application/pdf' }
    );
    fireEvent.change(screen.getByLabelText('Attachment (optional)'), {
      target: { files: [oversizedFile] },
    });

    expect(screen.getByRole('status')).toHaveTextContent('Attachments must be 10 MB or smaller.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('opens report file paths and keeps message deletion available', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        reports: [{
          id: 12,
          title: 'Placement report',
          message: 'Please review.',
          direction: 'received',
          is_read: 0,
          created_at: '2026-10-01 10:00:00',
          file_path: 'uploads/reports/placement-report.pdf',
        }],
      },
    });
    api.post.mockResolvedValue({ data: { success: true } });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    render(<AdminReports />);

    expect(await screen.findByText('From Registrar')).toBeInTheDocument();
    expect(screen.getByText('2026-10-01 10:00:00')).toBeInTheDocument();
    expect(screen.queryByText('Placement report')).not.toBeInTheDocument();
    expect(screen.getByText('Please review.')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Download Attachment' }));
    expect(openSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:8888/student-placement/placement_backend/api/common/download_report.php?notification_id=12',
      '_blank',
      'noopener,noreferrer'
    );
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/admin/delete_report.php', { report_id: 12 }));
    expect(window.confirm).toHaveBeenCalledWith('Delete this message?');
    window.confirm.mockRestore();
    openSpy.mockRestore();
  });
});
