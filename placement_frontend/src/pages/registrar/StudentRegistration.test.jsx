import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentRegistration from './StudentRegistration';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('StudentRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.post.mockResolvedValue({ data: { success: true } });
  });

  it('submits the official student fields and excludes calculated fields', async () => {
    const onSuccess = jest.fn();
    render(
      <MemoryRouter>
        <StudentRegistration isModal onSuccess={onSuccess} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Admission Number'), { target: { value: 'DTU16R2006' } });
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Aster' } });
    fireEvent.change(screen.getByLabelText('Father Name'), { target: { value: 'Mekonnen' } });
    fireEvent.change(screen.getByLabelText('Grandfather Name'), { target: { value: 'Kebede' } });
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'Amhara' } });
    fireEvent.change(screen.getByLabelText('Sex'), { target: { value: 'Female' } });
    fireEvent.change(screen.getByLabelText('Field of Study'), { target: { value: 'Natural Science' } });
    fireEvent.change(screen.getByLabelText('Total Mark (G12)'), { target: { value: '450' } });
    fireEvent.change(screen.getByLabelText('CGPA'), { target: { value: '3.75' } });
    fireEvent.change(screen.getByLabelText('COC Score'), { target: { value: '27' } });
    fireEvent.change(screen.getByLabelText('Disability Status'), { target: { value: 'Yes' } });
    fireEvent.change(screen.getByLabelText('Minority Status'), { target: { value: 'No' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register Student' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/registrar/register_student.php', {
      admission_number: 'DTU16R2006',
      given_name: 'Aster',
      father_name: 'Mekonnen',
      grandfather_name: 'Kebede',
      region: 'Amhara',
      sex: 'Female',
      field_of_study: 'Natural Science',
      total_mark: 450,
      cgpa: 3.75,
      coc_score: 27,
      disability: 'Yes',
      minority: 'No',
    }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/Cumulative Score|Placement Status/i)).not.toBeInTheDocument();
  });
});
