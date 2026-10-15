import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentInformation from './StudentInformation';
import api from '../../services/api.js';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('StudentInformation', () => {
  it('displays each student stream and filters the table by stream', () => {
    render(
      <MemoryRouter>
        <StudentInformation
          students={[
            {
              id: 1,
              first_name: 'Aster',
              last_name: 'Mekonnen',
              email: 'aster@example.com',
              stream: 'Natural Science',
            },
            {
              id: 2,
              first_name: 'Sara',
              last_name: 'Kebede',
              email: 'sara@example.com',
              stream: 'Social Science',
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Aster Mekonnen')).toBeInTheDocument();
    expect(screen.getByText('Sara Kebede')).toBeInTheDocument();
    expect(screen.getAllByText('Natural Science')).toHaveLength(2);
    expect(screen.getAllByText('Social Science')).toHaveLength(2);

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by stream' }), {
      target: { value: 'naturalscience' },
    });

    expect(screen.getByText('Aster Mekonnen')).toBeInTheDocument();
    expect(screen.queryByText('Sara Kebede')).not.toBeInTheDocument();
  });

  it('confirms and deletes only the selected student information record', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockResolvedValue({ data: { success: true } });

    render(
      <MemoryRouter>
        <StudentInformation
          students={[
            {
              id: 1,
              first_name: 'Aster',
              last_name: 'Mekonnen',
              email: 'aster@example.com',
            },
          ]}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this student?');
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      'api/registrar/delete_student.php',
      { data: { student_id: 1 } },
    ));
    await waitFor(() => expect(screen.queryByText('Aster Mekonnen')).not.toBeInTheDocument());
  });

  it('does not delete a student when the confirmation is canceled', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <MemoryRouter>
        <StudentInformation
          students={[{ id: 1, first_name: 'Aster', last_name: 'Mekonnen' }]}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText('Aster Mekonnen')).toBeInTheDocument();
    expect(screen.getByText('Aster Mekonnen')).toBeInTheDocument();
  });

  it('shows an error when deleting student information fails', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockRejectedValue({
      response: { data: { message: 'Student information not found.' } },
    });

    render(
      <MemoryRouter>
        <StudentInformation
          students={[{ id: 1, first_name: 'Aster', last_name: 'Mekonnen' }]}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Student information not found.');
    expect(screen.getByText('Aster Mekonnen')).toBeInTheDocument();
  });
});
