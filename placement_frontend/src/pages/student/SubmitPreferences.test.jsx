import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../services/api.js';
import SubmitPreferences, {
  hasDuplicateDepartmentChoices,
  updateSemesterTwoPreference,
} from './SubmitPreferences.jsx';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('SubmitPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads active departments from the MAMP student endpoint and maps its department data', async () => {
    api.get.mockResolvedValue({
      data: {
        departments: [
          { id: 1, name: 'Medicine', offered_semester: 1, status: 'active' },
          { id: 2, name: 'Pharmacy' },
          { id: 3, name: 'Nursing', offered_semester: 2, status: 'active' },
        ],
      },
    });
    const props = {
      assignedStream: 'Natural Science',
      preferenceSemester: 1,
      groupValues: ['health_science'],
      groupLabel: () => 'Health Science',
      preferences: [{ group: 'health_science', departments: [] }],
      onChoiceChange: jest.fn(),
      onDepartmentsLoaded: jest.fn(),
      onDepartmentLoadError: jest.fn(),
      disabled: false,
      semesterTwoDepartments: [],
      semesterTwoColleges: [],
      semesterTwoPreferences: [],
      semesterTwoChoiceCount: 0,
      onSemesterTwoPreferenceChange: jest.fn(),
    };
    const { rerender } = render(<SubmitPreferences {...props} />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        'http://localhost:8888/student-placement/placement_backend/api/student/get_active_departments.php',
        {
          params: { college_name: 'Health Science', status: 'active' },
          signal: expect.any(AbortSignal),
        },
      );
    });
    expect(await screen.findByText('3 active')).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Medicine' })).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: 'Pharmacy' })).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: 'Nursing' })).toHaveLength(3);

    rerender(<SubmitPreferences {...props} preferences={[...props.preferences]} />);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('disables Semester 1 departments selected in another slot and re-enables released selections', async () => {
    api.get.mockResolvedValue({
      data: {
        departments: [
          { id: 1, name: 'Medicine', status: 'active' },
          { id: 2, name: 'Pharmacy', status: 'active' },
        ],
      },
    });
    const props = {
      assignedStream: 'Natural Science',
      preferenceSemester: 1,
      groupValues: ['health_science', 'health_science'],
      groupLabel: () => 'Health Science',
      preferences: [
        { group: 'health_science', departments: ['Medicine'] },
        { group: 'health_science', departments: [''] },
      ],
      onChoiceChange: jest.fn(),
      onDepartmentsLoaded: jest.fn(),
      onDepartmentLoadError: jest.fn(),
      disabled: false,
      semesterTwoDepartments: [],
      semesterTwoPreferences: [],
      semesterTwoChoiceCount: 0,
      onSemesterTwoPreferenceChange: jest.fn(),
    };
    const { rerender } = render(<SubmitPreferences {...props} />);

    const firstChoice = await screen.findByRole('combobox', { name: 'Choice #1a Department' });
    const secondChoice = await screen.findByRole('combobox', { name: 'Choice #2a Department' });
    await screen.findAllByRole('option', { name: 'Medicine' });
    expect(firstChoice.querySelector('option[value="Medicine"]')).toBeEnabled();
    expect(secondChoice.querySelector('option[value="Medicine"]')).toBeDisabled();

    rerender(
      <SubmitPreferences
        {...props}
        preferences={[
          { group: 'health_science', departments: ['Pharmacy'] },
          { group: 'health_science', departments: [''] },
        ]}
      />,
    );

    expect(secondChoice.querySelector('option[value="Medicine"]')).toBeEnabled();
    expect(secondChoice.querySelector('option[value="Pharmacy"]')).toBeDisabled();
  });

  it('renders every active Semester 2 department in its college choice group', () => {
    render(<SubmitPreferences
      assignedStream="Natural Science"
      preferenceSemester={2}
      groupValues={[]}
      groupLabel={() => 'Other Natural Science'}
      preferences={[]}
      onChoiceChange={jest.fn()}
      onDepartmentsLoaded={jest.fn()}
      onDepartmentLoadError={jest.fn()}
      disabled={false}
      semesterTwoDepartments={[
        { id: 21, name: 'Biology', college_name: 'Other Natural Science', status: 'active', offered_semester: 2 },
        { id: 22, name: 'Chemistry', college_name: 'Other Natural Science', status: 'active', offered_semester: 2 },
        { id: 23, name: 'Physics', college_name: 'Other Natural Science', status: 'active', offered_semester: 2 },
        { id: 24, name: 'Inactive department', college_name: 'Other Natural Science', status: 'inactive', offered_semester: 2 },
        { id: 25, name: 'Semester 1 department', college_name: 'Other Natural Science', status: 'active', offered_semester: 1, is_first_semester_only: 1 },
        { id: 26, name: 'Returning department', college_name: 'Other Natural Science', status: 'active', offered_semester: 1, is_first_semester_only: 0 },
      ]}
      semesterTwoColleges={['Other Natural Science']}
      semesterTwoPreferences={[]}
      semesterTwoChoiceCount={3}
      onSemesterTwoPreferenceChange={jest.fn()}
    />);

    const firstChoice = screen.getByRole('combobox', { name: /Choice #1/ });
    expect(screen.getAllByRole('option', { name: 'Biology' })).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: 'Chemistry' })).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: 'Physics' })).toHaveLength(3);
    expect(screen.queryByRole('option', { name: 'Inactive department' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Semester 1 department' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Returning department' })).toHaveLength(3);
    expect(firstChoice.querySelector('optgroup')).toHaveAttribute('label', 'Other Natural Science');
  });

  it('disables Semester 2 departments selected in another slot and re-enables released selections', () => {
    const props = {
      assignedStream: 'Natural Science',
      preferenceSemester: 2,
      groupValues: [],
      groupLabel: () => 'Other Natural Science',
      preferences: [],
      onChoiceChange: jest.fn(),
      onDepartmentsLoaded: jest.fn(),
      onDepartmentLoadError: jest.fn(),
      disabled: false,
      semesterTwoDepartments: [
        { id: 21, name: 'Biology', college_name: 'Other Natural Science', status: 'active', offered_semester: 2 },
        { id: 22, name: 'Chemistry', college_name: 'Other Natural Science', status: 'active', offered_semester: 2 },
        { id: 23, name: 'Physics', college_name: 'Other Natural Science', status: 'active', offered_semester: 2 },
      ],
      semesterTwoPreferences: ['department:21', 'department:22'],
      semesterTwoChoiceCount: 2,
      allocatedPlacementGroup: 'other_natural_science',
      allocatedCollege: 'Other Natural Science',
      semesterTwoOpen: true,
      onSemesterTwoPreferenceChange: jest.fn(),
    };
    const StatefulPreferences = () => {
      const [selectedPreferences, setSelectedPreferences] = React.useState(props.semesterTwoPreferences);

      const handlePreferenceChange = (index, selectedId) => {
        setSelectedPreferences((current) => updateSemesterTwoPreference(
          current,
          index,
          selectedId,
          props.semesterTwoChoiceCount,
        ));
      };

      return (
        <SubmitPreferences
          {...props}
          semesterTwoPreferences={selectedPreferences}
          onSemesterTwoPreferenceChange={handlePreferenceChange}
        />
      );
    };

    render(<StatefulPreferences />);

    const firstChoice = screen.getByRole('combobox', { name: 'Choice #1' });
    const secondChoice = screen.getByRole('combobox', { name: 'Choice #2' });
    expect(firstChoice.querySelector('option[value="department:21"]')).toBeEnabled();
    expect(firstChoice.querySelector('option[value="department:22"]')).toBeDisabled();
    expect(secondChoice.querySelector('option[value="department:21"]')).toBeDisabled();
    expect(secondChoice.querySelector('option[value="department:22"]')).toBeEnabled();

    fireEvent.change(firstChoice, { target: { value: 'department:23' } });

    expect(secondChoice.querySelector('option[value="department:21"]')).toBeEnabled();
    expect(secondChoice.querySelector('option[value="department:23"]')).toBeDisabled();
    expect(firstChoice.querySelector('option[value="department:23"]')).toBeEnabled();

    fireEvent.change(firstChoice, { target: { value: '' } });
    expect(secondChoice.querySelector('option[value="department:23"]')).toBeEnabled();
    expect(firstChoice).toHaveValue('');
  });

  it('allows edits with duplicate choices while detecting them for validation', () => {
    const duplicateSemesterTwoChoices = updateSemesterTwoPreference(
      ['department:21', 'department:22'],
      1,
      'department:21',
      2,
    );
    expect(duplicateSemesterTwoChoices).toEqual(['department:21', 'department:21']);
    expect(hasDuplicateDepartmentChoices(2, [], duplicateSemesterTwoChoices)).toBe(true);

    expect(hasDuplicateDepartmentChoices(2, [], ['department:21', 'department:22'])).toBe(false);
    expect(hasDuplicateDepartmentChoices(1, [
      { group: 'health_science', departments: ['Medicine', 'Pharmacy'] },
      { group: 'git', departments: [' medicine '] },
    ], [])).toBe(true);
  });

  it('renders the Semester 1 stream field when Semester 1 is active', () => {
    render(<SubmitPreferences
      assignedStream="Natural Science"
      preferenceSemester={2}
      activeSemester={1}
      groupValues={[]}
      groupLabel={() => 'Other Natural Science'}
      preferences={[]}
      onChoiceChange={jest.fn()}
      onDepartmentsLoaded={jest.fn()}
      onDepartmentLoadError={jest.fn()}
      disabled
      semesterTwoDepartments={[
        { id: 21, name: 'Biology', college_name: 'Other Natural Science', status: 'active', offered_semester: 2 },
      ]}
      semesterTwoPreferences={[]}
      semesterTwoChoiceCount={1}
      onSemesterTwoPreferenceChange={jest.fn()}
    />);

    expect(screen.getByRole('combobox', {
      name: 'Registered Stream (Locked to your profile)',
    })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Choice #1' })).not.toBeInTheDocument();
  });

  it('renders allocated Semester 2 departments when Semester 2 is active', () => {
    render(<SubmitPreferences
      assignedStream="Social Science"
      preferenceSemester={2}
      activeSemester={2}
      groupValues={[]}
      groupLabel={() => 'Other Social Science'}
      preferences={[]}
      onChoiceChange={jest.fn()}
      onDepartmentsLoaded={jest.fn()}
      onDepartmentLoadError={jest.fn()}
      disabled={false}
      semesterTwoDepartments={[
        { id: 31, name: 'Economics', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
      ]}
      semesterTwoPreferences={[]}
      semesterTwoChoiceCount={1}
      allocatedPlacementGroup="other_social_science"
      allocatedCollege="Other Social Science"
      semesterTwoOpen
      onSemesterTwoPreferenceChange={jest.fn()}
    />);

    expect(screen.getByRole('combobox', { name: 'Choice #1' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', {
      name: 'Registered Stream (Locked to your profile)',
    })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Economics' })).toBeInTheDocument();
  });

  it('keeps Semester 1 choices for a student still marked Pending 1st Semester', () => {
    render(<SubmitPreferences
      assignedStream="Natural Science"
      preferenceSemester={1}
      activeSemester={2}
      groupValues={['other_natural_science']}
      groupLabel={() => 'Other Natural Science'}
      preferences={[{ group: '', department: '', departments: [] }]}
      onChoiceChange={jest.fn()}
      onDepartmentsLoaded={jest.fn()}
      onDepartmentLoadError={jest.fn()}
      disabled={false}
      semesterTwoDepartments={[
        { id: 51, name: 'Biology', college_name: 'Other Natural Science', status: 'active', offered_semester: 2 },
      ]}
      semesterTwoPreferences={[]}
      semesterTwoChoiceCount={1}
      allocatedPlacementGroup="other_natural_science"
      allocatedCollege="Other Natural Science"
      semesterTwoOpen
      onSemesterTwoPreferenceChange={jest.fn()}
    />);

    expect(screen.getByRole('combobox', {
      name: 'Registered Stream (Locked to your profile)',
    })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Biology' })).not.toBeInTheDocument();
  });

  it('limits Semester 2 options to the allocated placement group', () => {
    render(<SubmitPreferences
      assignedStream="Social Science"
      preferenceSemester={2}
      groupValues={[]}
      groupLabel={() => 'Other Social Science'}
      preferences={[]}
      onChoiceChange={jest.fn()}
      onDepartmentsLoaded={jest.fn()}
      onDepartmentLoadError={jest.fn()}
      disabled={false}
      semesterTwoDepartments={[
        { id: 31, name: 'Economics', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
        { id: 32, name: 'Sociology', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
        { id: 33, name: 'Law', college_name: 'School of Law', placement_group: 'law', status: 'active', offered_semester: 2 },
        { id: 34, name: 'Social Studies', college_name: 'College of Other Social Sciences', placement_group: 'other_social_science', status: 'active', offered_semester: 1, is_first_semester_only: 0 },
        { id: 35, name: 'First-semester Law', college_name: 'School of Law', placement_group: 'law', status: 'active', offered_semester: 1, is_first_semester_only: 1 },
      ]}
      semesterTwoColleges={['Other Social Science', 'School of Law']}
      semesterTwoPreferences={[]}
      semesterTwoChoiceCount={2}
      allocatedPlacementGroup="other_social_science"
      onSemesterTwoPreferenceChange={jest.fn()}
    />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Semester 2 Preferences: Showing active departments only in your allocated college (Other Social Science)',
    );
    expect(screen.getAllByRole('option', { name: 'Economics' })).toHaveLength(2);
    expect(screen.getAllByRole('option', { name: 'Sociology' })).toHaveLength(2);
    expect(screen.getAllByRole('option', { name: 'Social Studies' })).toHaveLength(2);
    expect(screen.queryByRole('option', { name: 'Law' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'First-semester Law' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'School of Law' })).not.toBeInTheDocument();
  });

  it('limits Semester 2 options to the exact allocated college', () => {
    render(<SubmitPreferences
      assignedStream="Social Science"
      preferenceSemester={2}
      groupValues={[]}
      groupLabel={() => 'Other Social Science'}
      preferences={[]}
      onChoiceChange={jest.fn()}
      onDepartmentsLoaded={jest.fn()}
      onDepartmentLoadError={jest.fn()}
      disabled={false}
      semesterTwoDepartments={[
        { id: 41, name: 'Economics', college_name: 'Other Social Science', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
        { id: 42, name: 'Community Development', college_name: 'Social Science College', placement_group: 'other_social_science', status: 'active', offered_semester: 2 },
        { id: 43, name: 'Special Needs', college_name: 'College of Other Social Sciences', is_active: 1 },
        { id: 44, name: 'Sociology', college_name: 'Social Science', status: 'active', offered_semester: 2 },
      ]}
      semesterTwoPreferences={[]}
      semesterTwoChoiceCount={1}
      allocatedPlacementGroup="other_social_science"
      allocatedCollege="Other Social Science"
      onSemesterTwoPreferenceChange={jest.fn()}
    />);

    expect(screen.getByRole('option', { name: 'Economics' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Special Needs' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sociology' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Community Development' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('College or placement group')).not.toBeInTheDocument();
  });
});
