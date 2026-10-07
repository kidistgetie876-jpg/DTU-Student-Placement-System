import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../../services/api.js';
import MissingScoresForm from './MissingScoresForm';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('MissingScoresForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves the selected student and returns to the registrar dashboard', async () => {
    api.post.mockResolvedValue({
      data: { success: true, cumulative_score: 82.5 },
    });

    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/student-score-form/12',
          state: {
            student: {
              id: 12,
              first_name: 'Marta',
              last_name: 'Kebede',
              username: 'marta',
              email: 'marta@example.com',
              gpa: '3.20',
              g12: 85,
              coc: 24,
              gender: 'Female',
              hasDisability: true,
              minority: false,
            },
            returnTo: '/registrar-dashboard',
            returnTab: 'student-info',
          },
        }]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/student-score-form/:studentId" element={<MissingScoresForm />} />
          <Route path="/registrar-dashboard" element={<h1>Returned to registrar dashboard</h1>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByLabelText('GPA (4.0)')).toHaveValue(3.2);
    expect(screen.getByLabelText('Grade 12 Result')).toHaveValue(85);
    expect(screen.getByLabelText('COC Result')).toHaveValue(24);
    expect(screen.getByLabelText('Gender')).toHaveValue('Female');
    expect(screen.getByLabelText('Disability')).toHaveValue('Yes');
    expect(screen.getByLabelText('Minority')).toHaveValue('No');

    fireEvent.change(screen.getByLabelText('GPA (4.0)'), { target: { value: '3.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Academic Scores' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      'api/common/profile_update.php',
      expect.objectContaining({
        user_id: 12,
        first_name: 'Marta',
        last_name: 'Kebede',
        username: 'marta',
        email: 'marta@example.com',
        gpa: '3.5',
        grade_12_result: 85,
        coc_result: 24,
        disability: 'Yes',
        minority: 'No',
      })
    ));
    expect(await screen.findByRole('heading', { name: 'Returned to registrar dashboard' })).toBeInTheDocument();
  });
});
