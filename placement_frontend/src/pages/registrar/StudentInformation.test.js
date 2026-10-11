import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentInformation from './StudentInformation';

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
});
