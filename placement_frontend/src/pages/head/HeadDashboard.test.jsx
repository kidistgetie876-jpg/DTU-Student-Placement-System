import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HeadDashboard from './HeadDashboard.jsx';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('HeadDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('user', JSON.stringify({
      id: 4,
      username: 'department-head',
      role: 'head',
    }));
    api.get.mockImplementation((url) => {
      if (url === 'api/head/get_head_dashboard.php') {
        return Promise.reject({
          response: {
            data: { message: 'No active department is assigned to this head' },
          },
        });
      }
      if (url === 'api/head/head_preferences.php') {
        return Promise.resolve({
          data: { success: true, preferences: { notifications: true, reporting: true } },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });
  });

  it('does not display demo department or placement data when no department is assigned', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HeadDashboard />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No active department is assigned to this head'
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Contact an administrator to assign an active department'
    );
    expect(screen.getByText('Not assigned')).toBeInTheDocument();
    expect(screen.getByText('No recent placement activity.')).toBeInTheDocument();
    expect(screen.queryByText('Computer Science')).not.toBeInTheDocument();
    expect(screen.queryByText('Amanuel Gebru')).not.toBeInTheDocument();
  });

  it('saves only capacity values and confirms them from the backend', async () => {
    let savedCapacity = 30;
    api.get.mockImplementation((url) => {
      if (url === 'api/head/get_head_dashboard.php') {
        return Promise.resolve({
          data: {
            success: true,
            department: {
              id: 21,
              name: 'Biology',
              college_name: 'College of Natural Science',
              stream: 'Natural',
              capacity: savedCapacity,
              assigned: 8,
              status: 'active',
              head_id: 4,
            },
            students: [],
            pendingStudents: [],
          },
        });
      }
      if (url === 'api/head/head_preferences.php') {
        return Promise.resolve({
          data: { success: true, preferences: { notifications: true, reporting: true } },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });
    api.post.mockImplementation((url, payload) => {
      if (url === 'api/common/departments_update.php') {
        savedCapacity = payload.departments[0].capacity;
      }
      return Promise.resolve({ data: { success: true } });
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HeadDashboard />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Capacity Plan' }));
    const capacityInput = await screen.findByRole('spinbutton', { name: 'Capacity for Biology' });
    fireEvent.change(capacityInput, { target: { value: '36' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Capacity Plan' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/common/departments_update.php',
      { departments: [{ id: 21, capacity: 36 }] }
    ));
    expect(await screen.findByText('Capacity plan saved and confirmed.')).toBeInTheDocument();
    expect(capacityInput).toHaveValue(36);
    expect(savedCapacity).toBe(36);
  });
});
