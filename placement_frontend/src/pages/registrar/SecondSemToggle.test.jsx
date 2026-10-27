import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../services/api.js';
import SecondSemToggle from './SecondSemToggle.jsx';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('SecondSemToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads the current portal state and opens it after a successful update', async () => {
    api.get.mockResolvedValue({ data: { success: true, is_second_sem_choice_open: 0 } });
    api.post.mockResolvedValue({
      data: { success: true, isOpen: true, message: 'The second-semester choice portal is now open.' },
    });

    render(<SecondSemToggle />);

    const toggle = await screen.findByRole('switch', { name: 'Second-semester department choice portal' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Portal Status: LOCKED')).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(await screen.findByText('The second-semester choice portal is now open.')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Portal Status: OPEN')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('api/registrar/toggle_second_sem_choice.php', { isOpen: true });
  });

  it('keeps the portal closed and reports an update error', async () => {
    api.get.mockResolvedValue({ data: { success: true, is_second_sem_choice_open: 0 } });
    api.post.mockRejectedValue(new Error('Request failed'));

    render(<SecondSemToggle />);

    const toggle = await screen.findByRole('switch', { name: 'Second-semester department choice portal' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('shows a loading state while fetching settings', async () => {
    let resolveSettings;
    api.get.mockReturnValue(new Promise((resolve) => {
      resolveSettings = resolve;
    }));

    render(<SecondSemToggle />);

    expect(screen.getByRole('switch', { name: 'Second-semester department choice portal' })).toBeDisabled();
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    resolveSettings({ data: { success: true, is_second_sem_choice_open: 1 } });
    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'));
  });
});
