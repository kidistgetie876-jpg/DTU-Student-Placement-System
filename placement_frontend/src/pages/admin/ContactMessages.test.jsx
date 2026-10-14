import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../../services/api.js';
import ContactMessages from './ContactMessages.jsx';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('ContactMessages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({
      data: {
        success: true,
        messages: [
          {
            id: 12,
            full_name: 'Aster Mekonnen',
            email: 'aster@example.edu',
            subject: 'Placement question',
            message: 'Could you clarify the placement dates?',
            student_id: 'DTU-2026-001',
            status: 'unread',
            created_at: '2026-10-12 10:00:00',
          },
          {
            id: 11,
            full_name: 'Dawit Girma',
            email: 'dawit@example.edu',
            subject: 'Read message',
            message: 'A previous question.',
            status: 'read',
            created_at: '2026-10-11 10:00:00',
          },
        ],
      },
    });
    api.post.mockResolvedValue({ data: { success: true } });
  });

  it('loads messages, filters by read state, and opens full details while marking unread as read', async () => {
    render(<ContactMessages />);

    expect(await screen.findByText('Aster Mekonnen')).toBeInTheDocument();
    expect(screen.getByText('Dawit Girma')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('api/admin/get_contact_messages.php');

    fireEvent.change(screen.getByLabelText('Filter messages'), { target: { value: 'unread' } });
    expect(screen.getByText('Aster Mekonnen')).toBeInTheDocument();
    expect(screen.queryByText('Dawit Girma')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'View message' })[0]);
    expect(await screen.findByText('Could you clarify the placement dates?')).toBeInTheDocument();
    expect(screen.getAllByText('DTU-2026-001')).toHaveLength(2);
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'aster@example.edu' })).toHaveAttribute(
      'href',
      'mailto:aster@example.edu'
    );
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/admin/mark_message_read.php', { id: 12 }));
    expect(screen.getAllByText('Read').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Thank you for contacting us.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Send Reply' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/admin/send_contact_reply.php', {
        recipient_email: 'aster@example.edu',
        reply_text: 'Thank you for contacting us.',
        message_id: 12,
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Reply sent successfully!');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Replied')).toBeInTheDocument();
  });

  it('shows a sending state while the reply request is pending', async () => {
    let finishSend;
    api.post.mockImplementation((endpoint) => {
      if (endpoint === 'api/admin/send_contact_reply.php') {
        return new Promise((resolve) => {
          finishSend = resolve;
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    render(<ContactMessages />);
    await screen.findByText('Aster Mekonnen');
    fireEvent.click(screen.getAllByRole('button', { name: 'View message' })[0]);
    await screen.findByText('Could you clarify the placement dates?');
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Thanks.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reply' }));

    expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled();
    finishSend({ data: { success: true, message: 'Reply sent successfully!' } });
    expect(await screen.findByRole('status')).toHaveTextContent('Reply sent successfully!');
  });

  it('deletes a message from history after confirmation', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ContactMessages />);
    expect(await screen.findByText('Aster Mekonnen')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    expect(confirmSpy).toHaveBeenCalledWith('Delete this contact message? This cannot be undone.');
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/admin/delete_contact_message.php', { id: 12 });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Contact message deleted.');
    expect(screen.queryByText('Aster Mekonnen')).not.toBeInTheDocument();
    expect(screen.getByText('Dawit Girma')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('does not call the delete API when deletion is cancelled', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ContactMessages />);
    expect(await screen.findByText('Aster Mekonnen')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalledWith('api/admin/delete_contact_message.php', expect.anything());
    expect(screen.getByText('Aster Mekonnen')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
