import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Reports from './Reports';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    defaults: { baseURL: 'http://127.0.0.1:8888/student-placement/placement_backend/' },
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

  it('opens the attachment from Apache after expanding report details', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    render(<Reports leader={{ id: 7 }} />);
    fireEvent.click(await screen.findByRole('button', { name: /More actions/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open attachment' }));

    expect(openSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:8888/student-placement/placement_backend/api/common/download_report.php?notification_id=1',
      '_blank',
      'noopener,noreferrer'
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('api/head/mark_report_read.php', { notification_id: 1 });

    openSpy.mockRestore();
  });

  it('shows one message body and concise metadata without debug details', async () => {
    render(<Reports leader={{ id: 7 }} />);

    expect(await screen.findByText('Department Report')).toBeInTheDocument();
    expect(screen.getByText('Please review this file.')).toBeInTheDocument();
    expect(screen.queryByText('Direction: Received')).not.toBeInTheDocument();
    expect(screen.queryByText('No students are currently assigned to this department.')).not.toBeInTheDocument();
    expect(screen.getByText(/From registrar/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-10-13 10:00:00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /More actions/ }));
    expect(screen.getByText('To head')).toBeInTheDocument();
    expect(screen.getAllByText('Please review this file.')).toHaveLength(1);
    expect(screen.queryByText(/Notification ID:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Direction:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hide actions/ }));
    expect(screen.queryByText('Direction: Received')).not.toBeInTheDocument();
  });

  it('shows the empty state only after the API returns an empty report list', async () => {
    api.get.mockResolvedValue({ data: { success: true, reports: [] } });
    render(<Reports leader={{ id: 7 }} />);

    expect(await screen.findByText('No reports have been sent or received.')).toBeInTheDocument();
  });

  it('does not present an API failure as an empty report list', async () => {
    api.get.mockRejectedValue(new Error('Reports service unavailable'));
    render(<Reports leader={{ id: 7 }} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Reports service unavailable');
    expect(screen.queryByText('No reports have been sent or received.')).not.toBeInTheDocument();
  });

  it('hides Registrar placement-batch announcements from the report list', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        reports: [
          {
            id: 2,
            direction: 'received',
            sender_role: 'registrar',
            title: 'Official Placement Approved: New Students Assigned',
            message: 'The Office of the University Registrar has approved the placement batch. 1 new students have been officially assigned to your department: Yohannes Haile (DTU16R1003). Please review your placed students roster.',
          },
          {
            id: 3,
            direction: 'received',
            sender_role: 'registrar',
            title: 'Placement clarification',
            message: 'Please confirm the updated capacity.',
          },
        ],
      },
    });

    render(<Reports leader={{ id: 7 }} />);

    expect(await screen.findByText('Placement clarification')).toBeInTheDocument();
    expect(screen.queryByText('Official Placement Approved: New Students Assigned')).not.toBeInTheDocument();
    expect(screen.queryByText(/Yohannes Haile \(DTU16R1003\)/)).not.toBeInTheDocument();
    expect(screen.queryByText('No reports have been sent or received.')).not.toBeInTheDocument();
  });

  it('renders reports and student options safely when identifiers are missing or duplicated', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        reports: [
          { direction: 'received', message: 'Report without an ID.' },
          undefined,
        ],
      },
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <Reports
        leader={{ id: 7 }}
        students={[
          { student_id: 12, username: 'First Student' },
          { student_id: 12, username: 'Duplicate ID Student' },
          { username: 'Student Without ID' },
          undefined,
        ]}
      />
    );

    expect(await screen.findByText('Report without an ID.')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'First Student (ID: 12)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Duplicate ID Student (ID: 12)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Student Without ID' })).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining('Each child in a list should have a unique "key" prop'),
      expect.anything(),
    );

    consoleError.mockRestore();
  });

  it('sends an individual head message to the student account while displaying the University ID', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    render(
      <Reports
        leader={{ id: 7 }}
        students={[{
          account_id: 57,
          student_id: 'DTU16R2057',
          university_student_id: 'DTU16R2057',
          username: 'Student Example',
        }]}
      />
    );

    expect(await screen.findByRole('option', { name: 'Student Example (ID: DTU16R2057)' })).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '57' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Placement update' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/head/send_head_message.php',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ));
    expect(api.post.mock.calls[0][1].get('recipient_id')).toBe('57');
    expect(api.post.mock.calls[0][1].get('student_id')).toBe('57');
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
