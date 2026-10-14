import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlacementInfo from './PlacementInfo';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('PlacementInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retries a 503 response and uses settings after the service recovers', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: {} } } });
      }

      if (api.get.mock.calls.filter(([calledUrl]) => calledUrl === url).length < 3) {
        return Promise.reject({ response: { status: 503 } });
      }
      return Promise.resolve({ data: { gpa_weight: 55 } });
    });

    render(<PlacementInfo />);

    expect(screen.getByRole('status')).toHaveTextContent('Connecting to server...');
    expect(await screen.findByText(
      (_, element) => element?.tagName === 'STRONG' && element.textContent.includes('55%'),
      {},
      { timeout: 7000 }
    )).toBeInTheDocument();
    expect(api.get.mock.calls.filter(([url]) => url.includes('get_placement_settings.php'))).toHaveLength(3);
    expect(screen.queryByText(/Default values are shown/)).not.toBeInTheDocument();
  });

  it('shows fallback guidance after retries fail', async () => {
    api.get.mockRejectedValue({ response: { status: 503 } });

    render(<PlacementInfo />);

    expect(await screen.findByText(/Default values are shown/, {}, { timeout: 7000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Placement Information & Student Guide' })).toBeInTheDocument();
    expect(screen.getByText(
      (_, element) => element?.tagName === 'STRONG' && element.textContent.includes('40%')
    )).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(6));
  });

  it('loads live department capacity rows when the capacity tab is opened', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: {} } } });
      }
      if (url.includes('get_placement_settings.php')) {
        return Promise.resolve({ data: { settings: {} } });
      }
      if (url.includes('get_public_capacities.php')) {
        return Promise.resolve({
          data: {
            success: true,
            departments: [{
              id: 12,
              name: 'Computer Science',
              college_name: 'College of Natural Sciences',
              stream: 'Natural',
              capacity: 85,
            }],
          },
        });
      }
      return Promise.reject(new Error(`Unexpected API request: ${url}`));
    });

    render(<PlacementInfo />);
    fireEvent.click(screen.getByRole('button', { name: 'Capacity Overview' }));

    expect(await screen.findByRole('cell', { name: 'Computer Science' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '85' })).toBeInTheDocument();
    expect(screen.getByText('Natural', { exact: true })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('api/common/get_public_capacities.php');
  });

  it('shows a retryable error when department capacities fail to load', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve({ data: { settings: { placement: {} } } });
      }
      if (url.includes('get_placement_settings.php')) {
        return Promise.resolve({ data: { settings: {} } });
      }
      return Promise.reject(new Error('Capacity service unavailable'));
    });

    render(<PlacementInfo />);
    fireEvent.click(screen.getByRole('button', { name: 'Capacity Overview' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Capacity service unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
