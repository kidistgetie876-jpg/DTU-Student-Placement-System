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

const publicRules = {
  overview: {
    title: 'Registrar-configured placement rules',
    summary: 'Policy overview maintained by the Registrar.',
  },
  formula: {
    title: 'Configured merit formula',
    components: [
      { label: 'CGPA factor', denominator: 4, weight: 50, weight_key: 'gpa_weight' },
      { label: 'Grade 12 factor', denominator: 600, weight: 20, weight_key: 'grade_12_weight' },
      { label: 'COC factor', denominator: 30, weight: 30, weight_key: 'coc_weight' },
    ],
    bonus_note: 'Configured bonus rule.',
  },
  affirmative_action: {
    title: 'Configured affirmative-action points',
    bonus_points: [
      { label: 'Women', points: 7, value_key: 'female_bonus_points' },
      { label: 'Disability', points: 3, value_key: 'disability_bonus_points' },
      { label: 'Emerging regions', points: 4, value_key: 'minority_male_bonus_points' },
    ],
    description: 'Configured bonus explanation.',
  },
  choice_preference: {
    title: 'Configured preference policy',
    details: ['Preference rule from database.'],
  },
  capacity_quota: {
    title: 'Configured capacity policy',
    general_quota_percent: 80,
    reserved_female_quota_percent: 20,
    details: ['Capacity rule from database.'],
  },
  tie_breaking: {
    title: 'Configured tie policy',
    criteria: ['Registrar tie rule.'],
    details: 'Tie details from database.',
  },
  appeals: {
    title: 'Configured appeal policy',
    criteria: ['Appeal criterion from database.'],
    submission: 'Appeal instructions from database.',
    deadline_start: '2026-08-27',
    deadline_end: '2026-08-30',
    deadline_note: 'Appeal deadline rule from database.',
  },
  publishing: {
    title: 'Configured publishing policy',
    provisional: 'Provisional result rule from database.',
    official: 'Official result rule from database.',
    appeal: 'Published result appeal rule from database.',
  },
  schedule: {},
};

describe('PlacementInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve(portalSettingsResponse);
      }
      return Promise.resolve({ data: { success: true, data: publicRules } });
    });
  });

  it('keeps active and inactive navigation tabs visibly contrasted', async () => {
    render(<PlacementInfo />);

    await screen.findByRole('heading', { name: publicRules.overview.title });
    const rulesTab = screen.getByRole('button', { name: 'Rules & Criteria' });
    const capacityTab = screen.getByRole('button', { name: 'Capacity Overview' });

    expect(rulesTab).toHaveAttribute('aria-pressed', 'true');
    expect(rulesTab.className).toContain('from-blue-600');
    expect(rulesTab.className).toContain('text-white');
    expect(capacityTab).toHaveAttribute('aria-pressed', 'false');
    expect(capacityTab.className).toContain('bg-blue-50');
    expect(capacityTab.className).toContain('text-blue-900');

    fireEvent.click(capacityTab);

    expect(capacityTab).toHaveAttribute('aria-pressed', 'true');
    expect(capacityTab.className).toContain('from-blue-600');
    expect(rulesTab).toHaveAttribute('aria-pressed', 'false');
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
              ...publicRules,
              formula: {
                ...publicRules.formula,
                components: [
                  publicRules.formula.components[0],
                  { ...publicRules.formula.components[1], denominator: 700 },
                  publicRules.formula.components[2],
                ],
              },
              affirmative_action: {
                ...publicRules.affirmative_action,
                bonus_points: [
                  { ...publicRules.affirmative_action.bonus_points[0], points: 7 },
                  { ...publicRules.affirmative_action.bonus_points[1], points: 3 },
                  { ...publicRules.affirmative_action.bonus_points[2], points: 4 },
                ],
              },
            },
          },
        });
      }
      return Promise.reject(new Error(`Unexpected API request: ${url}`));
    });

    render(<PlacementInfo />);

    expect(await screen.findByText('Grade 12 factor')).toBeInTheDocument();
    expect(screen.getByText('Score / 700 × 20%')).toBeInTheDocument();
    expect(screen.getByText(/Women:/)).toHaveTextContent('+7 points');
    expect(screen.getByText(/Disability:/)).toHaveTextContent('+3 points');
    expect(screen.getByText(/Emerging regions:/)).toHaveTextContent('+4 points');
    expect(screen.getByRole('heading', { name: 'Configured preference policy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Configured capacity policy' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Configured tie policy' })).not.toBeInTheDocument();
    expect(screen.queryByText('Higher COC / relevant specific-subject score')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Configured appeal policy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Configured publishing policy' })).not.toBeInTheDocument();
    expect(screen.queryByText('Appeal criterion from database.')).not.toBeInTheDocument();
    expect(screen.queryByText('Provisional result rule from database.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Published Department Intake Capacities' })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('api/common/get_placement_rules.php');
  });

  it('does not show hardcoded rules when the rules API fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve(portalSettingsResponse);
      }
      return Promise.reject(new Error('Rules service unavailable'));
    });

    render(<PlacementInfo />);

    expect(await screen.findByText('Rules service unavailable')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Placement Information & Student Guide' })).toBeInTheDocument();
    expect(screen.queryByText(/Score \/ 4 ×/)).not.toBeInTheDocument();
    expect(screen.queryByText('Higher CGPA')).not.toBeInTheDocument();
    expect(screen.queryByText('Higher Grade 12 examination result')).not.toBeInTheDocument();
    expect(screen.queryByText('Higher COC / relevant specific-subject score')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Appeals Policy and Criteria' })).not.toBeInTheDocument();
  });

  it('shows a configuration error rather than static rules when the database has no policy records', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve(portalSettingsResponse);
      }
      return Promise.resolve({ data: { success: true, data: {} } });
    });

    render(<PlacementInfo />);

    expect(await screen.findByText('Public placement rules are missing or incomplete.')).toBeInTheDocument();
    expect(screen.queryByText('Higher CGPA')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tie-Breaking Policy' })).not.toBeInTheDocument();
  });

  it('loads live department capacity rows when the capacity tab is opened', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('system_settings_api.php')) {
        return Promise.resolve(portalSettingsResponse);
      }
      if (url.includes('get_placement_rules.php')) {
        return Promise.resolve({ data: { success: true, data: publicRules } });
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
