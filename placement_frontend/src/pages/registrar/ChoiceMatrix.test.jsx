import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import api from '../../services/api.js';
import ChoiceMatrix from './ChoiceMatrix.jsx';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

const student = {
  id: 'DTU16R1001',
  id_number: 'DTU16R1001',
  name: 'Aster Student',
  email: 'aster@example.com',
  stream: 'Natural Science',
  choices: [
    { priority: 2, semester: 1, dept_name: 'Nursing', college_name: 'Health Science', stream: 'Natural Science' },
    { priority: 1, semester: 1, dept_name: 'Medicine', college_name: 'Health Science', stream: 'Natural Science' },
    { priority: 1, semester: 2, dept_name: 'Public Health', college_name: 'Health Science', stream: 'Natural Science' },
    { priority: 2, semester: 2, dept_name: 'Nutrition', college_name: 'Health Science', stream: 'Natural Science' },
    { priority: 1, semester: 1, dept_name: 'Computer Science', college_name: 'Gafat Tech', stream: 'Natural Science' },
  ],
};

describe('ChoiceMatrix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows ranked college and department cards in the semester columns', () => {
    render(<ChoiceMatrix students={[student]} totalStudentCount={1} totalRecordCount={1} />);

    expect(screen.getAllByText('Health Science')).toHaveLength(4);
    expect(screen.getByText('Medicine')).toBeInTheDocument();
    expect(screen.getByText('Gafat Tech')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getAllByText('Health Science').filter((element) => (
      element.classList.contains('text-slate-600')
    ))).toHaveLength(4);
    expect(screen.getByText('Medicine')).toHaveClass('text-xs', 'font-semibold', 'text-slate-800');
    expect(screen.getByRole('group', { name: 'Medicine choice' })).toHaveClass(
      'rounded-lg',
      'bg-slate-100/90',
      'border',
      'border-slate-300',
      'text-slate-800',
      'p-2.5',
      'text-xs',
      'font-semibold',
      'shadow-sm',
    );
    expect(screen.getByRole('group', { name: 'Computer Science choice' })).toHaveClass(
      'bg-slate-100/90',
      'border-slate-300',
    );
    expect(screen.getByRole('group', { name: 'Public Health choice' })).toHaveClass(
      'bg-slate-100/90',
      'border-slate-300',
    );
    expect(screen.getByText('Medicine')).toHaveClass('text-slate-800', 'font-semibold');
    expect(screen.getByText('Computer Science')).toHaveClass('text-slate-800', 'font-semibold');
    expect(screen.getAllByText('1st Choice')).toHaveLength(2);
    expect(screen.getAllByRole('columnheader', { name: '1st Choice' })[0]).toHaveClass(
      '!bg-slate-800',
      '!text-white',
      '!font-bold',
      'uppercase',
      '!border-slate-700',
      'rounded',
      'shadow-sm',
    );
    expect(within(screen.getByRole('row', { name: /Aster Student/ }))
      .getByRole('cell', { name: /Medicine/ })).not.toHaveTextContent('1st Choice');
    expect(screen.getByText('DTU16R1001')).toHaveClass(
      'bg-slate-100',
      'text-slate-800',
      'font-mono',
      'border-slate-200',
      'rounded',
    );
    expect(screen.getByText('SEMESTER 1 PREFERENCES')).toBeInTheDocument();
    expect(screen.getByText('SEMESTER 2 PREFERENCES')).toBeInTheDocument();
    expect(screen.getByText('SEMESTER 1 PREFERENCES')).toHaveClass(
      '!bg-blue-600',
      '!text-white',
      '!border-b-2',
      '!font-extrabold',
      '!tracking-wider',
      'shadow-inner',
      'uppercase',
    );
    expect(screen.getByText('SEMESTER 2 PREFERENCES')).toHaveClass(
      '!bg-indigo-700',
      '!text-white',
      '!border-b-2',
      '!font-extrabold',
      '!tracking-wider',
      'shadow-inner',
      'uppercase',
    );
    expect(screen.getByRole('table').querySelector('thead')).toHaveClass(
      'bg-[#0f3c6d]',
      'text-white',
      'font-bold',
      'uppercase',
      'tracking-wider',
      'border-b-2',
      'border-slate-700',
      'shadow-sm',
    );
    ['STUDENT ID', 'STUDENT NAME', 'STREAM', 'STATUS', 'DETAILS'].forEach((title) => {
      expect(screen.getByRole('columnheader', { name: title })).toHaveClass(
        '!bg-[#0f3c6d]',
        '!text-white',
        '!font-bold',
      );
    });

    expect(screen.getAllByRole('columnheader', { name: '1st Choice' })).toHaveLength(2);
    expect(screen.getAllByRole('columnheader', { name: '1st Choice' })[0]).toHaveClass(
      'min-w-[180px]',
      'px-3',
      'py-2',
      '!bg-slate-800',
      '!text-white',
      '!font-bold',
    );
    expect(screen.getAllByRole('columnheader', { name: '2nd Choice' })[0]).toHaveClass(
      '!border-r-4',
      '!border-r-slate-300',
    );
    expect(within(screen.getByRole('row', { name: /Aster Student/ }))
      .getAllByRole('cell')[6]).toHaveClass('border-r-4', 'border-r-slate-300');
    expect(screen.getByText('Pending')).toHaveClass(
      'bg-amber-100',
      'text-amber-800',
      'rounded-full',
      'border-amber-300',
      'font-bold',
      'px-3',
    );
    expect(screen.getByRole('row', { name: /Aster Student/ })).toHaveClass(
      'odd:bg-white',
      'even:bg-slate-50/80',
      'hover:bg-slate-100',
      'transition-colors',
      'border-b',
      'border-slate-200',
    );
  });

  it('displays the university ID while retaining the Ministry ID for registrar actions', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    render(<ChoiceMatrix
      students={[{
        ...student,
        student_id: 'DTU16R1001',
        id_number: 'MOE10001',
        admission_number: 'MOE10001',
      }]}
      totalStudentCount={1}
      totalRecordCount={1}
    />);

    expect(screen.getByText('DTU16R1001')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('MOE10001');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Aster Student choices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected Semester 1 Choices (1)' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Semester 1 Choices' }));

    expect(api.post).toHaveBeenCalledWith(
      'api/registrar/delete_selected_student_choices.php',
      {
        admissionNumbers: ['MOE10001'],
        semester: 1,
        expectedSemester: 1,
        confirmed: true,
      },
      { withCredentials: true },
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Deleted Semester 1 choices for 1 selected student(s).',
    );
  });

  it('groups ranked departments by college and semester in the details dialog', () => {
    render(<ChoiceMatrix students={[student]} totalStudentCount={1} totalRecordCount={1} />);

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'College Choice 1: Health Science' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'College Choice 2: Gafat Tech' })).toBeInTheDocument();

    const healthCollege = within(dialog).getByRole('group', { name: 'College Choice 1: Health Science' });
    expect(within(healthCollege).getByText('Semester 1 Departments (Ranked)')).toBeInTheDocument();
    expect(within(healthCollege).getByText('Semester 2 Departments (Ranked)')).toBeInTheDocument();
    expect(within(healthCollege).getAllByText(/^(Medicine|Nursing|Public Health|Nutrition)$/)
      .map((item) => item.textContent)).toEqual([
        'Medicine',
        'Nursing',
        'Public Health',
        'Nutrition',
      ]);
    expect(within(healthCollege).getAllByText(/^(1st|2nd)$/)).toHaveLength(4);
  });

  it('renders Semester 2 choice maps in Semester 2 columns while retaining Semester 1 choices', () => {
    render(<ChoiceMatrix
      students={[{
        ...student,
        status: 'Pending 2nd Semester',
        choices: [
          { priority: 1, semester: 1, dept_name: 'Medicine', college_name: 'Health Science' },
        ],
        sem2_choices: {
          choice1: {
            priority: 1,
            dept_name: 'Accounting and Finance',
            college_name: 'Other Social Science',
          },
          choice2: {
            priority: 2,
            dept_name: 'Early Childhood Care and Education',
            college_name: 'Other Social Science',
          },
        },
      }]}
      totalStudentCount={1}
      totalRecordCount={1}
    />);

    const row = screen.getByRole('row', { name: /Aster Student/ });
    const cells = within(row).getAllByRole('cell');
    expect(cells[5]).toHaveTextContent('Medicine');
    expect(cells[5]).not.toHaveTextContent('Accounting and Finance');
    expect(cells[6]).toHaveTextContent('Accounting and Finance');
    expect(cells[7]).toHaveTextContent('Early Childhood Care and Education');
  });

  it('normalizes pending semester status labels in the matrix', () => {
    render(<ChoiceMatrix
      students={[{
        ...student,
        status: 'pending_second_semester',
        choices: [],
        sem2_choices: {},
      }]}
      totalStudentCount={1}
      totalRecordCount={1}
    />);

    expect(screen.getByText('Pending 2nd Semester')).toHaveClass(
      'bg-amber-100',
      'text-amber-800',
    );
  });

  it('shows broad semester-two college queues in the same preference card layout', () => {
    render(<ChoiceMatrix
      students={[{
        ...student,
        choices: [{
          priority: 1,
          semester: 2,
          dept_id: null,
          dept_name: 'Broad Group / Semester 2 Queue',
          college_name: 'Agriculture',
        }],
      }]}
      totalStudentCount={1}
      totalRecordCount={1}
    />);

    const choiceCell = within(screen.getByRole('row', { name: /Aster Student/ }))
      .getByRole('cell', { name: /Broad Group \/ Semester 2 Queue/ });
    expect(choiceCell).toHaveTextContent('Agriculture');
    expect(choiceCell).not.toHaveTextContent('1st Choice');
    expect(screen.getAllByRole('columnheader', { name: '1st Choice' })).toHaveLength(2);
    expect(choiceCell).not.toHaveTextContent('—');
    expect(screen.getByText('Agriculture')).toHaveClass('text-slate-600', 'font-medium');
    expect(screen.getByText('Broad Group / Semester 2 Queue')).toHaveClass('text-sm', 'font-semibold');
  });

  it('keeps saved broad group choices visible in the student choice matrix', () => {
    render(<ChoiceMatrix
      students={[{
        ...student,
        choices: [{
          dept_id: null,
          dept_name: 'Other Natural Science',
          department: 'Other Natural Science',
          priority: 3,
          stream: 'Natural Science',
        }],
      }]}
      totalStudentCount={1}
      totalRecordCount={1}
      maxChoicesCount={3}
    />);

    const choiceCell = within(screen.getByRole('row', { name: /Aster Student/ }))
      .getByRole('cell', { name: /Other Natural Science/ });
    expect(choiceCell).not.toHaveTextContent('3rd Choice');
    expect(screen.getByRole('group', { name: 'Other Natural Science choice' })).toHaveClass(
      'bg-slate-100',
      'border-slate-300',
    );
    expect(screen.getAllByText('Natural Science').some((element) => (
      element.classList.contains('text-slate-600')
    ))).toBe(true);
    expect(screen.getByText('Other Natural Science')).toHaveClass('text-slate-800');
    expect(screen.getByText('SEMESTER 1 PREFERENCES')).toBeInTheDocument();
  });

  it('uses an approved status badge when the API reports an approved student', () => {
    render(<ChoiceMatrix
      students={[{ ...student, status: 'Approved' }]}
      totalStudentCount={1}
      totalRecordCount={1}
    />);

    expect(screen.getByText('Approved')).toHaveClass('bg-emerald-100', 'text-emerald-800');
  });

  it('deletes only the selected semester choices for selected students after confirmation', async () => {
    const secondStudent = {
      ...student,
      id: 'DTU16R1002',
      id_number: 'DTU16R1002',
      name: 'Birtukan Student',
      email: 'birtukan@example.com',
    };
    const onChoicesDeleted = jest.fn();
    api.post.mockResolvedValue({
      data: { success: true, message: 'Deleted Semester 2 choices for 1 selected student(s) (2 record(s)); choices for the other semester were preserved.' },
    });
    render(
      <ChoiceMatrix
        students={[student, secondStudent]}
        allStudents={[student, secondStudent]}
        totalStudentCount={2}
        totalRecordCount={2}
        activeSemester={2}
        onChoicesDeleted={onChoicesDeleted}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Aster Student choices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected Semester 2 Choices (1)' }));
    expect(screen.getByRole('dialog')).toHaveTextContent("Delete selected students' Semester 2 choices?");
    expect(screen.getByRole('dialog')).toHaveTextContent('Only Semester 2 choice records');
    expect(screen.getByRole('dialog')).toHaveTextContent('Choices for the other semester');
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Semester 2 Choices' }));

    expect(api.post).toHaveBeenCalledWith(
      'api/registrar/delete_selected_student_choices.php',
      {
        admissionNumbers: ['DTU16R1001'],
        semester: 2,
        expectedSemester: 2,
        confirmed: true,
      },
      { withCredentials: true },
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Deleted Semester 2 choices for 1 selected student(s) (2 record(s)); choices for the other semester were preserved.',
    );
    expect(onChoicesDeleted).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: 'Select Aster Student choices' })).not.toBeChecked();
  });

  it('deletes only one student’s Semester 1 choices while Semester 2 is active', async () => {
    api.post.mockResolvedValue({
      data: { success: true, message: 'Deleted Semester 1 choices for 1 selected student(s) (3 record(s)); choices for the other semester were preserved.' },
    });
    render(
      <ChoiceMatrix
        students={[student]}
        totalStudentCount={1}
        totalRecordCount={1}
        activeSemester={2}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete Aster Student Semester 1 choices' }));
    expect(screen.getByRole('dialog')).toHaveTextContent("Delete this student's Semester 1 choices?");
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Semester 1 Choices' }));

    expect(api.post).toHaveBeenCalledWith(
      'api/registrar/delete_selected_student_choices.php',
      {
        admissionNumbers: ['DTU16R1001'],
        semester: 1,
        expectedSemester: 2,
        confirmed: true,
      },
      { withCredentials: true },
    );
    expect(await screen.findByRole('status')).toHaveTextContent('choices for the other semester were preserved.');
  });

  it('selects all students through the master checkbox and allows cancelling the confirmation', () => {
    const secondStudent = {
      ...student,
      id: 'DTU16R1002',
      id_number: 'DTU16R1002',
      name: 'Birtukan Student',
      email: 'birtukan@example.com',
    };
    render(
      <ChoiceMatrix
        students={[student, secondStudent]}
        allStudents={[student, secondStudent]}
        totalStudentCount={2}
        totalRecordCount={2}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all students with choices' }));
    expect(screen.getByRole('checkbox', { name: 'Select Aster Student choices' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Birtukan Student choices' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected Semester 1 Choices (2)' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});