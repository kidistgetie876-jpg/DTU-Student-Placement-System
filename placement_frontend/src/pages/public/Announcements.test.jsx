import React from 'react';
import { render, screen } from '@testing-library/react';
import Announcements from './Announcements';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('Announcements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows announcements returned by the API', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        announcements: [{ id: 1, title: 'Placement dates', content: 'Applications open soon.' }],
      },
    });

    render(<Announcements />);

    expect(await screen.findByText('Placement dates')).toBeInTheDocument();
    expect(screen.getByText('Applications open soon.')).toBeInTheDocument();
  });

  it('keeps the page usable and explains a missing announcements API', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } });

    render(<Announcements />);

    expect(await screen.findByText(
      'The announcements service could not be found. Please try again later.'
    )).toBeInTheDocument();
    expect(screen.getByText('No matching announcements found.')).toBeInTheDocument();
  });
});
