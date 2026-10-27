import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PlacementInfo from './PlacementInfo';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

const portalSettingsResponse = {
  data: { settings: { placement: {} } },
};

describe('PlacementInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve(portalSettingsResponse);
      }
      return Promise.resolve({ data: { success: true, data: {} } });
    });
  });

  it('loads complete placement rules and displays live scoring values', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve(portalSettingsResponse);
      }
      if (url.includes('get_placement_rules.php')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              formula: { g12_total_base: 700 },
              affirmative_action: {
                female_bonus_points: 7,
                disability_bonus_points: 3,
                minority_male_bonus_points: 4,
              },
            },
          },
        });
      }
      return Promise.reject(new Error(`Unexpected API request: ${url}`));
    });

    render(<PlacementInfo />);

    expect(await screen.findByText(/Grade 12 mark \/ 700 × 20/)).toBeInTheDocument();
    expect(screen.getByText(/Female students:/)).toHaveTextContent('+7 points');
    expect(screen.getByText(/Students with a disability:/)).toHaveTextContent('+3 points');
    expect(screen.getByText(/Minority \/ emerging-region students:/)).toHaveTextContent('+4 points');
    expect(screen.getByRole('heading', { name: 'Department Choice Preference Order Policy' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Department Intake Capacity and Quota Management' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tie-Breaking Policy' })).toBeInTheDocument();
    expect(screen.queryByText('Higher COC / relevant specific-subject score')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appeals Policy and Criteria' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Provisional and Official Result Publishing' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Published Department Intake Capacities' })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('api/common/get_placement_rules.php');
  });

  it('shows comprehensive fallback rules if the rules API fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve(portalSettingsResponse);
      }
      return Promise.reject(new Error('Rules service unavailable'));
    });

    render(<PlacementInfo />);

    expect(await screen.findByText(/Complete default rules are shown/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Placement Information & Student Guide' })).toBeInTheDocument();
    expect(screen.getByText(/CGPA \/ 4.0 × 50/)).toBeInTheDocument();
    expect(screen.getByText('Higher CGPA')).toBeInTheDocument();
    expect(screen.getByText('Higher Grade 12 examination result')).toBeInTheDocument();
    expect(screen.queryByText('Higher COC / relevant specific-subject score')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Department Intake Capacity and Quota Management' })).not.toBeInTheDocument();
    expect(screen.getByText(/Submission window: 08\/27\/2026 – 08\/30\/2026/)).toBeInTheDocument();
  });

  it('loads live department capacity rows when the capacity tab is opened', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve(portalSettingsResponse);
      }
      if (url.includes('get_placement_rules.php')) {
        return Promise.resolve({ data: { success: true, data: {} } });
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

    expect(await screen.findByRole('columnheader', { name: 'Department ID' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Stream / College' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Department Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Maximum Student Quota' })).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: 'Computer Science' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '85' })).toBeInTheDocument();
    expect(screen.getByText('Natural', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('College of Natural Sciences')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Published Department Intake Capacities' })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('api/common/get_public_capacities.php');
  });

  it('shows a retryable error when department capacities fail to load', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve(portalSettingsResponse);
      }
      if (url.includes('get_placement_rules.php')) {
        return Promise.resolve({ data: { success: true, data: {} } });
      }
      return Promise.reject(new Error('Capacity service unavailable'));
    });

    render(<PlacementInfo />);
    fireEvent.click(screen.getByRole('button', { name: 'Capacity Overview' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Capacity service unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
