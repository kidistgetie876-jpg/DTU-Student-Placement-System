import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SystemConfig from './SystemConfig';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const savedSettings = {
  maintenance: {
    enabled: false,
    title: 'System Under Maintenance',
    message: 'The DTU Placement Portal is currently undergoing scheduled system updates. Services will resume shortly.',
    expectedReturn: 'Soon',
  },
};

describe('SystemConfig maintenance settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: { success: true, settings: savedSettings } });
    api.post.mockResolvedValue({ data: { success: true, settings: { ...savedSettings, maintenance: { ...savedSettings.maintenance, enabled: true } } } });
  });

  it('saves maintenance mode under the maintenance settings key', async () => {
    render(<SystemConfig />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open System Maintenance & Status' }));
    fireEvent.click(await screen.findByRole('button', { name: '🟢 OFF' }));
    expect(screen.getByRole('button', { name: '🔴 ON' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Maintenance Notice Title'), { target: { value: 'Maintenance window' } });
    fireEvent.change(screen.getByLabelText('Custom Message for Public/Students'), { target: { value: 'Please check back soon.' } });
    fireEvent.change(screen.getByLabelText('Expected Resumption Time (Optional)'), { target: { value: '2:00 PM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Maintenance Status' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/common/system_settings_api.php', {
      settings: {
        maintenance: {
          enabled: true,
          title: 'Maintenance window',
          message: 'Please check back soon.',
          expectedReturn: '2:00 PM',
        },
      },
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('✓ Maintenance status successfully saved!');
  });

  it('pre-fills the toggle from the saved API value', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        settings: { maintenance: { ...savedSettings.maintenance, enabled: 'true' } },
      },
    });

    render(<SystemConfig />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open System Maintenance & Status' }));
    expect(await screen.findByRole('button', { name: '🔴 ON' })).toHaveAttribute('aria-pressed', 'true');
  });
});
<<<<<<< HEAD:placement_frontend/src/pages/admin/SystemConfig.test.jsx

describe('SystemConfig placement schedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: { success: true, settings: {} } });
    api.post.mockResolvedValue({ data: { success: true, settings: {} } });
  });

  it('blocks saving dates that are out of chronological order', async () => {
    render(<SystemConfig />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Placement Dates & Deadlines' }));

    fireEvent.change(await screen.findByLabelText('Placement Processing Start Date'), {
      target: { value: '2026-10-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Placement Timeline' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((alert) => alert.textContent.includes(
      'Placement Processing Start Date must be on or after Preference Submission Deadline.'
    ))).toBe(true);
    expect(api.post).not.toHaveBeenCalled();
  });
});
=======
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:src/pages/admin/SystemConfig.test.jsx
