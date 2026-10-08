import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlacementInfo from './PlacementInfo';
import api from '../../services/api.js';
import { SYSTEM_SETTINGS_UPDATED_STORAGE_KEY } from '../../services/systemSettingsEvents.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('PlacementInfo schedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes the schedule in another tab after registrar changes deadlines', async () => {
    api.get.mockImplementation((url) => (
      url.includes('system_settings_api.php')
        ? Promise.resolve({
          data: {
            settings: {
              placement: {
                submissionStart: '2027-01-02',
                submissionDeadline: '2027-01-05',
                processingStart: '2027-01-10',
                processingEnd: '2027-01-12',
                resultsDate: '2027-01-15',
                appealStart: '2027-01-16',
                appealEnd: '2027-01-20',
              },
            },
          },
        })
        : Promise.resolve({ data: {} })
    ));

    render(<PlacementInfo />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(await screen.findByText('01/02/2027 - 01/05/2027')).toBeInTheDocument();
    expect(screen.getByText('01/10/2027 - 01/12/2027')).toBeInTheDocument();
    expect(screen.getByText('01/15/2027')).toBeInTheDocument();
    expect(screen.getByText('01/16/2027 - 01/20/2027')).toBeInTheDocument();

    const storageEvent = new Event('storage');
    Object.defineProperty(storageEvent, 'key', { value: SYSTEM_SETTINGS_UPDATED_STORAGE_KEY });
    window.dispatchEvent(storageEvent);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(4);
    });
  });

  it('does not show hardcoded schedule dates when the API has no configured dates', async () => {
    api.get.mockResolvedValue({ data: { settings: { placement: {} } } });

    render(<PlacementInfo />);
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));

    expect(await screen.findAllByText('To be announced - To be announced')).toHaveLength(3);
    expect(screen.getByText('To be announced')).toBeInTheDocument();
    expect(screen.queryByText(/10\/\d\d\/2026/)).not.toBeInTheDocument();
  });
});
