import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  api.get.mockResolvedValue({ data: { success: true, students: [] } });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('StudentInformation', () => {
  it('paginates student records five at a time and supports page navigation', () => {
    const students = Array.from({ length: 12 }, (_, index) => ({
      admission_number: `DTU-${index + 1}`,
      given_name: `Student${index + 1}`,
      father_name: 'Test',
      grandfather_name: 'Student',
      placement_status: 'Pending',
    }));

    render(
      <MemoryRouter>
        <StudentInformation students={students} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Showing 1 to 5 of 12 entries')).toBeInTheDocument();
    expect(screen.getByText('Student1')).toBeInTheDocument();
    expect(screen.getByText('Student5')).toBeInTheDocument();
    expect(screen.queryByText('Student6')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 6 to 10 of 12 entries')).toBeInTheDocument();
    expect(screen.getByText('Student6')).toBeInTheDocument();
    expect(screen.queryByText('Student1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(screen.getByText('Showing 11 to 12 of 12 entries')).toBeInTheDocument();
    expect(screen.getByText('Student12')).toBeInTheDocument();
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
              admission_number: 'DTU-001',
              given_name: 'Aster',
              father_name: 'Mekonnen',
              grandfather_name: 'Kebede',
              field_of_study: 'Natural Science',
            },
            {
              admission_number: 'DTU-002',
              given_name: 'Sara',
              father_name: 'Kebede',
              grandfather_name: 'Tadesse',
              field_of_study: 'Social Science',
            },
          ]}
        />
      </MemoryRouter>,
    );

    const firstStudentRow = screen.getByRole('row', { name: /DTU-001/ });
    const secondStudentRow = screen.getByRole('row', { name: /DTU-002/ });
    expect(within(firstStudentRow).getByText('Aster')).toBeInTheDocument();
    expect(within(firstStudentRow).getByText('Mekonnen')).toBeInTheDocument();
    expect(within(firstStudentRow).getByText('Kebede')).toBeInTheDocument();
    expect(within(secondStudentRow).getByText('Sara')).toBeInTheDocument();
    expect(within(secondStudentRow).getByText('Kebede')).toBeInTheDocument();
    expect(within(secondStudentRow).getByText('Tadesse')).toBeInTheDocument();
    expect(screen.getAllByText('Natural Science')).toHaveLength(2);
    expect(screen.getAllByText('Social Science')).toHaveLength(2);

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by stream' }), {
      target: { value: 'naturalscience' },
    });

    expect(screen.getByRole('row', { name: /DTU-001/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /DTU-002/ })).not.toBeInTheDocument();
  });

  it('does not expose delete or unrestricted edit actions for student rows', () => {
    render(
      <MemoryRouter>
        <StudentInformation
          students={[{
            admission_number: 'DTU-001',
            given_name: 'Aster',
            father_name: 'Mekonnen',
            grandfather_name: 'Kebede',
          }]}
        />
      </MemoryRouter>,
    );

    const studentRow = screen.getByRole('row', { name: /DTU-001/ });
    expect(studentRow).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent.trim());
    const minorityIndex = headers.indexOf('Minority');
    expect(headers.slice(minorityIndex, minorityIndex + 3)).toEqual([
      'Minority',
      'Cumulative Score',
      'Placement Status',
    ]);
    const studentCells = within(studentRow).getAllByRole('cell');
    expect(studentCells[11]).toHaveTextContent('No');
    expect(studentCells[12]).toHaveTextContent('0.00');
    expect(studentCells[13]).toHaveTextContent('Pending');
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fill Scores' })).not.toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('fetches and displays the official admission-number student fields', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        students: [{
          admission_number: 'DTU-2026-001',
          given_name: 'Aster',
          father_name: 'Mekonnen',
          grandfather_name: 'Kebede',
          region: 'Amhara',
          sex: 'Female',
          field_of_study: 'Natural Science',
          total_mark: 450,
          cgpa: 3.75,
          coc_score: 27,
          cumulative_score: 98.88,
          disability: 'No',
          minority: 'Yes',
          female_flag: true,
          disability_flag: false,
          minority_flag: true,
          score_breakdown: {
            cgpa_contribution: 46.88,
            grade12_contribution: 15,
            coc_contribution: 27,
            base_score: 88.88,
            female_bonus: 0,
            minority_bonus: 0,
            disability_bonus: 0,
            scenario_bonus: 10,
            applied_scenario: 'minority_female',
            affirmative_action_bonus: 10,
            cumulative_score: 98.88,
          },
          placement_status: 'Pending',
        }],
      },
    });

    render(
      <MemoryRouter>
        <StudentInformation />
      </MemoryRouter>,
    );

    expect(await screen.findByText('DTU-2026-001')).toBeInTheDocument();
    const studentRow = screen.getByRole('row', { name: /DTU-2026-001/ });
    expect(within(studentRow).getByText('Aster')).toBeInTheDocument();
    expect(screen.getByText('Amhara')).toBeInTheDocument();
    expect(within(studentRow).getByText('Mekonnen')).toBeInTheDocument();
    expect(within(studentRow).getByText('Kebede')).toBeInTheDocument();
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(screen.getByText('Natural Science')).toBeInTheDocument();
    expect(screen.getByText('450')).toBeInTheDocument();
    expect(screen.getByText('3.75')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();
    expect(within(studentRow).getByRole('cell', { name: '98.88' })).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    [
      'Admission Number',
      'First Name',
      'Father Name',
      'Grandfather Name',
      'Region',
      'Sex',
      'Field of Study',
      'Total Mark (G12)',
      'CGPA',
      'COC Score',
      'Cumulative Score',
      'Disability',
      'Minority',
      'Placement Status',
      'Actions',
    ].forEach((heading) => {
      expect(screen.getByRole('columnheader', { name: heading })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show score breakdown for DTU-2026-001' }));
    const breakdown = screen.getByRole('region', {
      name: 'Cumulative score breakdown for DTU-2026-001',
    });
    expect(within(breakdown).getByText('Base total: 88.88')).toBeInTheDocument();
    expect(within(breakdown).getByText('Female: Yes')).toBeInTheDocument();
    expect(within(breakdown).getByText('Minority / developing region (Amhara): Yes')).toBeInTheDocument();
    expect(within(breakdown).getByText('Disability: No')).toBeInTheDocument();
    expect(within(breakdown).getByText('Applied rule: Minority / Developing Region (Female)')).toBeInTheDocument();
    expect(within(breakdown).getByText('Scenario bonus: +10.00')).toBeInTheDocument();
    expect(within(breakdown).getByText('Total bonus: +10.00')).toBeInTheDocument();
    expect(within(breakdown).getByText(/88\.88 \+ 10\.00 = 98\.88/)).toBeInTheDocument();

    expect(api.get).toHaveBeenCalledWith('api/registrar/student_information.php', {
      withCredentials: true,
    });
  });

  it('displays a zero cumulative score when the API value is missing', () => {
    render(
      <MemoryRouter>
        <StudentInformation students={[{
          admission_number: 'DTU-004',
          given_name: 'Liya',
          cumulative_score: null,
        }]} />
      </MemoryRouter>,
    );

    const studentRow = screen.getByRole('row', { name: /DTU-004/ });
    expect(within(studentRow).getByRole('cell', { name: '0.00' })).toBeInTheDocument();
  });

  it('formats CGPA to two decimals and shows a dash for a missing COC score', () => {
    render(
      <MemoryRouter>
        <StudentInformation students={[{
          admission_number: 'DTU-006',
          given_name: 'Mahi',
          cgpa: 3.5,
          coc_score: null,
        }]} />
      </MemoryRouter>,
    );

    const cells = within(screen.getByRole('row', { name: /DTU-006/ })).getAllByRole('cell');
    expect(cells[8]).toHaveTextContent('3.50');
    expect(cells[9]).toHaveTextContent('—');
  });

  it('clamps cumulative scores above 100 in the student table', () => {
    render(
      <MemoryRouter>
        <StudentInformation students={[{
          admission_number: 'DTU-005',
          given_name: 'Alem',
          cumulative_score: 100.63,
        }]} />
      </MemoryRouter>,
    );

    const studentRow = screen.getByRole('row', { name: /DTU-005/ });
    expect(within(studentRow).getByText('100.00')).toBeInTheDocument();
  });

  it('accepts a direct student array response from the API', async () => {
    api.get.mockResolvedValueOnce({
      data: [{
        admission_number: 'DTU-2026-002',
        given_name: 'Mimi',
        father_name: 'Kebede',
      }],
    });

    render(
      <MemoryRouter>
        <StudentInformation />
      </MemoryRouter>,
    );

    expect(await screen.findByText('DTU-2026-002')).toBeInTheDocument();
    expect(screen.getByText('Mimi')).toBeInTheDocument();
  });

  it('renders Update Scores in the Actions column when a handler is supplied', () => {
    const onEditScores = jest.fn();
    render(
      <MemoryRouter>
        <StudentInformation
          students={[{
            admission_number: 'DTU-003',
            given_name: 'Hana',
            father_name: 'Abebe',
            region: 'Oromia',
            cgpa: 3.2,
          }]}
          onEditScores={onEditScores}
        />
      </MemoryRouter>,
    );

    const row = screen.getByRole('row', { name: /DTU-003/ });
    expect(within(row).getByRole('cell', { name: '3.20' })).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Update Scores' }));
    expect(onEditScores).toHaveBeenCalledWith(expect.objectContaining({ admission_number: 'DTU-003' }));
  });

  it('searches by admission number, given name, and father name', () => {
    render(
      <MemoryRouter>
        <StudentInformation students={[
          {
            admission_number: 'DTU-001',
            given_name: 'Aster',
            father_name: 'Mekonnen',
            grandfather_name: 'Kebede',
          },
          {
            admission_number: 'DTU-002',
            given_name: 'Sara',
            father_name: 'Tadesse',
            grandfather_name: 'Abebe',
          },
        ]} />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText('Search admission number, given name, or father name...');
    fireEvent.change(searchInput, { target: { value: 'mekonnen' } });
    expect(screen.getByRole('row', { name: /DTU-001/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /DTU-002/ })).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'DTU-002' } });
    expect(screen.getByRole('row', { name: /DTU-002/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /DTU-001/ })).not.toBeInTheDocument();
  });

  it('renders region and field-of-study values from alternate API casing', () => {
    render(
      <MemoryRouter>
        <StudentInformation students={[{
          admission_number: 'DTU-004',
          given_name: 'Mimi',
          father_name: 'Abebe',
          Region: 'Tigray',
          FieldOfStudy: 'Social Science',
        }]} />
      </MemoryRouter>,
    );

    const row = screen.getByRole('row', { name: /DTU-004/ });
    expect(within(row).getByText('Tigray')).toBeInTheDocument();
    expect(within(row).getByText('Social Science')).toBeInTheDocument();
  });
});
