import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlacedStudents from './PlacedStudents.jsx';
import api from '../../services/api.js';
import * as XLSX from 'xlsx';

const placedStudentsEndpoint = 'api/registrar/get_placed_students.php';
const departmentsEndpoint = 'api/common/departments_api.php';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: jest.fn((rows) => rows),
    book_new: jest.fn(() => ({})),
    book_append_sheet: jest.fn(),
  },
  writeFile: jest.fn(),
}));

const placedStudents = [
  {
    student_id: 10,
    id_number: 'DTU16R2001',
    name: 'Abebe Kebede',
    stream: 'Natural Science',
    college: 'College of Natural & Computational Sciences',
    final_score: 91,
    department: 'Agricultural Economics',
    choice_rank: 1,
    status: 'Pending',
  },
  {
    student_id: 11,
    id_number: 'DTU16R2002',
    name: 'Mekdes Alemu',
    stream: 'Social Science',
    college: 'College of Business & Economics',
    final_score: 87.5,
    department: 'Economics',
    choice_rank: 2,
    status: 'Approved',
  },
];

describe('PlacedStudents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockImplementation((path) => {
      if (path === placedStudentsEndpoint) {
        return Promise.resolve({ data: { success: true, students: placedStudents, count: 2 } });
      }
      if (path === departmentsEndpoint) {
        return Promise.resolve({ data: { success: true, departments: [] } });
      }
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
  });

  it('loads placement results and filters the table with an accurate count', async () => {
    render(<PlacedStudents />);

    expect(await screen.findByText('Abebe Kebede')).toBeInTheDocument();
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Placed Students', level: 1 })).toHaveClass('text-2xl', 'text-slate-800');
    expect(screen.getByText('Manage and export finalized student placement allocations.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2 students');

    fireEvent.change(screen.getByLabelText('Stream'), { target: { value: 'Natural Science' } });
    fireEvent.change(screen.getByLabelText('Assigned Department'), { target: { value: 'Agricultural Economics' } });

    expect(screen.getByText('Abebe Kebede')).toBeInTheDocument();
    expect(screen.queryByText('Mekdes Alemu')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 students');

    fireEvent.change(screen.getByLabelText('Search by student name or ID'), { target: { value: 'dtu16r2001' } });
    expect(screen.getByText('Abebe Kebede')).toBeInTheDocument();
    expect(screen.getByText('Choice 1')).toBeInTheDocument();
  });

  it('exports the filtered results to the selected format', async () => {
    const workbook = { SheetNames: [], Sheets: {} };
    XLSX.utils.book_new.mockReturnValue(workbook);
    render(<PlacedStudents />);
    await screen.findByText('Abebe Kebede');

    fireEvent.change(screen.getByLabelText('Export format'), { target: { value: 'csv' } });
    fireEvent.change(screen.getByLabelText('Stream'), { target: { value: 'Natural Science' } });
    fireEvent.click(screen.getByRole('button', { name: /Export Results/i }));

    await waitFor(() => expect(XLSX.writeFile).toHaveBeenCalledWith(
      workbook,
      'placed_students_results.csv',
      { bookType: 'csv' },
    ));
    expect(XLSX.utils.aoa_to_sheet).toHaveBeenCalledWith(expect.arrayContaining([
      expect.arrayContaining(['Student ID', 'Full Name']),
      expect.arrayContaining(['DTU16R2001', 'Abebe Kebede']),
    ]));
  });

  it('displays current placement status values without changing their meaning', async () => {
    api.get.mockImplementation((path) => Promise.resolve({
      data: path === departmentsEndpoint
        ? { success: true, departments: [] }
        : {
          success: true,
          students: [
            { ...placedStudents[0], status: 'Pending 2nd Semester' },
            { ...placedStudents[1], status: 'Assigned' },
          ],
          count: 2,
        },
    }));
    render(<PlacedStudents />);

    expect(await screen.findByText('Pending 2nd Semester')).toBeInTheDocument();
    expect(screen.getByText('Assigned')).toBeInTheDocument();
  });

  it('keeps stream options available, removes the college filter, and filters departments by stream', async () => {
    api.get.mockImplementation((path) => Promise.resolve({
      data: path === 'api/common/departments_api.php'
        ? {
          success: true,
          departments: [
            { name: 'Biology', stream: 'Natural Science', college_name: 'College of Natural Sciences' },
            { name: 'Economics', stream: 'Social Science', college_name: 'College of Business & Economics' },
          ],
        }
        : { success: true, students: [], count: 0 },
    }));
    render(<PlacedStudents />);

    expect(await screen.findByText('There are no placed students to display.')).toBeInTheDocument();
    const streamSelect = screen.getByLabelText('Stream');
    const departmentSelect = screen.getByLabelText('Assigned Department');
    expect(screen.queryByLabelText('College')).not.toBeInTheDocument();
    expect(streamSelect).toHaveDisplayValue('All streams');
    expect(streamSelect).toContainHTML('Natural Science');
    expect(streamSelect).toContainHTML('Social Science');
    expect(await screen.findByRole('option', { name: 'Biology' })).toBeInTheDocument();

    fireEvent.change(streamSelect, { target: { value: 'Natural Science' } });
    expect(departmentSelect).toContainHTML('Biology');
    expect(departmentSelect).not.toContainHTML('Economics');

    fireEvent.change(departmentSelect, { target: { value: 'Biology' } });
    expect(departmentSelect).toHaveDisplayValue('Biology');
    fireEvent.change(streamSelect, { target: { value: 'Social Science' } });
    expect(departmentSelect).toHaveDisplayValue('All departments');
    expect(departmentSelect).toContainHTML('Economics');
    expect(departmentSelect).not.toContainHTML('Biology');
  });

  it('reloads placement rows when the parent refresh token changes', async () => {
    let currentStudents = placedStudents;
    api.get.mockImplementation((path) => Promise.resolve({
      data: path === departmentsEndpoint
        ? { success: true, departments: [] }
        : { success: true, students: currentStudents, count: currentStudents.length },
    }));
    const { rerender } = render(<PlacedStudents refreshToken={0} />);
    expect(await screen.findByText('Abebe Kebede')).toBeInTheDocument();

    currentStudents = [];
    rerender(<PlacedStudents refreshToken={1} />);

    await waitFor(() => {
      expect(screen.getByText('There are no placed students to display.')).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledWith(placedStudentsEndpoint);
    expect(api.get.mock.calls.filter(([path]) => path === placedStudentsEndpoint)).toHaveLength(2);
  });
});