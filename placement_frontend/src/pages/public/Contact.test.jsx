import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../services/api.js';
import Contact from './Contact.jsx';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('Contact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: {} });
  });

  it('sends a public contact message to the office, displays success, and clears the fields', async () => {
    api.post.mockResolvedValue({
      data: { success: true, message: 'Your message was sent to the Registrar and Administrator.' },
    });

    render(<Contact />);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Aster Mekonnen' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'aster@example.edu' } });
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'Placement question' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'I need help with my placement.' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Your message was sent to the Registrar and Administrator.');
    expect(api.post).toHaveBeenCalledWith('api/common/submit_contact.php', {
      full_name: 'Aster Mekonnen',
      email: 'aster@example.edu',
      subject: 'Placement question',
      message: 'I need help with my placement.',
    });
    expect(screen.getByLabelText(/email address/i)).toBeRequired();
    expect(screen.queryByLabelText(/send to \/ recipient/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toHaveValue('');
      expect(screen.getByLabelText(/email address/i)).toHaveValue('');
      expect(screen.getByLabelText(/subject/i)).toHaveValue('');
      expect(screen.getByLabelText(/message/i)).toHaveValue('');
    });
  });

  it('rejects an invalid email and keeps entered values', async () => {
    render(<Contact />);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Aster Mekonnen' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'invalid-email' } });
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'Help' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'Please contact me.' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please provide your name, a valid email address, a subject, and a message.');
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Aster Mekonnen');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not expose recipient routing controls on the public form', () => {
    render(<Contact />);
    expect(screen.queryByLabelText(/send to \/ recipient/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/student id/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/specific recipient/i)).not.toBeInTheDocument();
  });
});
