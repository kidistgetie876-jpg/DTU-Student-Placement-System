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
  it('paginates student records five at a time and supports page navigation', () => {
    const students = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      first_name: `Student${index + 1}`,
      last_name: 'Test',
      email: `student${index + 1}@example.com`,
    }));

    render(
      <MemoryRouter>
        <StudentInformation students={students} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Showing 1 to 5 of 12 entries')).toBeInTheDocument();
    expect(screen.getByText('Student1 Test')).toBeInTheDocument();
    expect(screen.getByText('Student5 Test')).toBeInTheDocument();
    expect(screen.queryByText('Student6 Test')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 6 to 10 of 12 entries')).toBeInTheDocument();
    expect(screen.getByText('Student6 Test')).toBeInTheDocument();
    expect(screen.queryByText('Student1 Test')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(screen.getByText('Showing 11 to 12 of 12 entries')).toBeInTheDocument();
    expect(screen.getByText('Student12 Test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Showing 6 to 10 of 12 entries')).toBeInTheDocument();
  });

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
