import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    fireEvent.click(screen.getByRole('button', { name: 'View message' }));
    expect(await screen.findByText('Could you clarify the placement dates?')).toBeInTheDocument();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/admin/mark_message_read.php', { id: 12 }));
    expect(screen.getAllByText('Read').length).toBeGreaterThan(0);
  });
});
