import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';
import api from '../../services/api.js';
import DataImport from './DataImport.jsx';
import { parseStudentImportGrid, parseUserImportGrid } from './DataImport.jsx';

jest.mock('../../services/api.js', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock('xlsx', () => ({
  read: jest.fn(),
  utils: {
    sheet_to_json: jest.fn(),
  },
}));

describe('parseStudentImportGrid', () => {
  it('finds headers below a title row and parses standard student columns', () => {
    const result = parseStudentImportGrid([
      ['Student roster for placement'],
      ['First Name', 'Last Name', 'Email Address', 'Phone Number', 'CGPA'],
      ['Aster', 'Mekonnen', 'aster@example.com', '0911000000', '3.5'],
    ]);

    expect(result.headersFound).toBe(true);
    expect(result.rows).toEqual([
      expect.objectContaining({
        first_name: 'Aster',
        last_name: 'Mekonnen',
        username: 'aster',
        email: 'aster@example.com',
        phone: '0911000000',
        gpa: '3.5',
      }),
    ]);
  });

  it('splits a full student name and supports alternate email and score headers', () => {
    const result = parseStudentImportGrid([
      ['Student Name', 'Student Email', 'G12', 'COC'],
      ['Abebe Kebede', 'abebe@example.com', '88', '25'],
    ]);

    expect(result.rows).toEqual([
      expect.objectContaining({
        first_name: 'Abebe',
        last_name: 'Kebede',
        email: 'abebe@example.com',
        grade_12_result: '88',
        coc_result: '25',
      }),
    ]);
  });

  it('accepts an existing-student row with a student ID and no email', () => {
    const result = parseStudentImportGrid([
      ['Student ID', 'First Name', 'Last Name', 'Username', 'GPA', 'G12 Result'],
      ['DTU16R1004', 'Marta', 'Tadesse', 'marta16', '3.6', '82'],
    ]);

    expect(result.headersFound).toBe(true);
    expect(result.rows).toEqual([
      expect.objectContaining({
        id_number: 'DTU16R1004',
        first_name: 'Marta',
        last_name: 'Tadesse',
        username: 'marta16',
        email: '',
        gpa: '3.6',
        grade_12_result: '82',
      }),
    ]);
  });

  it('reports unrecognized headers and filters invalid email rows', () => {
    expect(parseStudentImportGrid([['ID', 'Full Name'], ['1', 'Aster Mekonnen']])).toEqual({
      rows: [],
      headersFound: false,
    });

    expect(parseStudentImportGrid([
      ['Name', 'Email'],
      ['Aster Mekonnen', 'not-an-email'],
    ])).toEqual({ rows: [], headersFound: true });

    expect(parseStudentImportGrid([
      ['First Name', 'Last Name', 'Username'],
      ['Aster', 'Mekonnen', 'asterm'],
    ])).toEqual({
      headersFound: true,
      rows: [
        expect.objectContaining({
          first_name: 'Aster',
          last_name: 'Mekonnen',
          username: 'asterm',
          email: '',
        }),
      ],
    });
  });

  describe('parseUserImportGrid', () => {
    it('parses User/HOD headers without treating the rows as student records', () => {
      const result = parseUserImportGrid([
        ['User ID', 'First Name', 'Last Name', 'Username', 'Email', 'Phone', 'Role'],
        ['DTU-HOD-001', 'Aster', 'Mekonnen', 'aster.hod', 'aster@example.edu', '0911000000', 'Head of Department'],
      ]);

      expect(result).toEqual({
        headersFound: true,
        rows: [{
          id_number: 'DTU-HOD-001',
          first_name: 'Aster',
          last_name: 'Mekonnen',
          username: 'aster.hod',
          email: 'aster@example.edu',
          phone: '0911000000',
          role: 'Head of Department',
          password: '',
        }],
      });
    });

    it('accepts role header variations and rows with an inferred role', () => {
      const roleHeaderResult = parseUserImportGrid([
        ['User ID', 'First Name', 'Last Name', 'Username', 'Email', 'User_Role'],
        ['DTU-REG-003', 'Ruth', 'Tadesse', 'ruth.reg', 'ruth@example.edu', ''],
      ]);
      const rolelessResult = parseUserImportGrid([
        ['User ID', 'First Name', 'Last Name', 'Username', 'Email'],
        ['DTU16R1001', 'Dawit', 'Kebede', 'dawit.student', 'dawit@example.edu'],
      ]);

      expect(roleHeaderResult.rows).toEqual([
        expect.objectContaining({ id_number: 'DTU-REG-003', role: '', password: '' }),
      ]);
      expect(rolelessResult.rows).toEqual([
        expect.objectContaining({ id_number: 'DTU16R1001', role: '', password: '' }),
      ]);
    });

    it('maps an ID Number header to id_number for user imports', () => {
      const result = parseUserImportGrid([
        ['ID Number', 'Full Name', 'Username', 'Email', 'Role'],
        ['DTU-HOD-027', 'Abebe Kebede', 'abebe.hod', 'abebe@example.edu', 'Head of Department'],
      ]);

      expect(result.rows).toEqual([expect.objectContaining({
        id_number: 'DTU-HOD-027',
        first_name: 'Abebe',
        last_name: 'Kebede',
      })]);
    });

    it('does not classify student sheets with a role column as user imports', () => {
      const grid = [
        ['Student ID', 'First Name', 'Last Name', 'Email', 'GPA', 'Role'],
        ['DTU-004', 'Aster', 'Mekonnen', 'aster@example.edu', '3.4', 'Student'],
      ];

      expect(parseUserImportGrid(grid).headersFound).toBe(false);
      expect(parseStudentImportGrid(grid).rows).toHaveLength(1);
    });
  });

  describe('DataImport', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      XLSX.read.mockReturnValue({ SheetNames: ['students'], Sheets: { students: {} } });
      XLSX.utils.sheet_to_json.mockReturnValue([
        ['Student ID', 'First Name', 'Last Name', 'Email', 'Stream'],
        ['DTU-004', 'Aster', 'Mekonnen', 'aster@example.edu', 'Natural Science'],
      ]);
    });

    it('shows the backend summary when all matching records already exist unchanged', async () => {
      api.post.mockResolvedValue({
        data: {
          success: true,
          message: 'Import complete: 0 new, 0 updated, 1 skipped (1 already exist, unchanged).',
          inserted_count: 0,
          updated_count: 0,
          skipped_count: 1,
          unchanged_count: 1,
          skipped: [{
            row: 2,
            reason: 'Already exists; imported values are unchanged.',
            unchanged: true,
          }],
        },
      });
      const onImportSuccess = jest.fn();

      const { container } = render(<DataImport onImportSuccess={onImportSuccess} />);
      fireEvent.change(container.querySelector('input[type="file"]'), {
        target: { files: [{ name: 'students.csv', arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)) }] },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Preview File' }));
      await screen.findByText('DTU-004');
      const previewNotice = screen.getByRole('status');
      expect(previewNotice).toHaveTextContent('Preview ready: 1 student.');
      expect(previewNotice).toHaveClass('alert-success');
      expect(previewNotice).toHaveClass('bg-green-100', 'text-green-800', 'border-green-300');
      expect(previewNotice).not.toHaveClass('alert-danger');

      fireEvent.click(await screen.findByRole('button', { name: 'Save to System' }));

      expect(await screen.findByText(/0 new, 0 updated, 1 skipped \(1 already exist, unchanged\)/i)).toBeInTheDocument();
      expect(screen.queryByText(/Already exists; imported values are unchanged/i)).not.toBeInTheDocument();
      await waitFor(() => expect(onImportSuccess).toHaveBeenCalledTimes(1));
      expect(api.post).toHaveBeenCalledWith('api/admin/import_api.php', {
        students: [expect.objectContaining({ id_number: 'DTU-004', gpa: '', stream: 'Natural Science' })],
      });
    });

    it('previews and sends User/HOD rows only to the user importer', async () => {
      XLSX.utils.sheet_to_json.mockReturnValue([
        ['User ID', 'First Name', 'Last Name', 'Username', 'Email', 'Phone', 'Role'],
        ['DTU-HOD-001', 'Aster', 'Mekonnen', 'aster.hod', 'aster@example.edu', '0911000000', 'Head of Department'],
      ]);
      api.post.mockResolvedValue({
        data: {
          success: true,
          message: 'User import complete: 1 new, 0 skipped.',
          temporary_passwords: [{ id_number: 'DTU-HOD-001', username: 'aster.hod', password: 'temporary-secret' }],
        },
      });

      const { container } = render(<DataImport />);
      fireEvent.change(container.querySelector('input[type="file"]'), {
        target: { files: [{ name: 'users.csv', arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)) }] },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Preview File' }));

      expect(await screen.findByText('DTU-HOD-001')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'User/HOD Data Bulk Import' })).toBeInTheDocument();
      expect(screen.getByText('ROLE')).toBeInTheDocument();
      expect(screen.queryByText('GPA')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Save to System' }));
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('api/admin/import_users.php', {
        users: [{
          first_name: 'Aster',
          last_name: 'Mekonnen',
          username: 'aster.hod',
          id_number: 'DTU-HOD-001',
          email: 'aster@example.edu',
          phone: '0911000000',
          role: 'Head of Department',
          password: '',
        }],
      }));
      expect(await screen.findByText(/Temporary passwords: DTU-HOD-001 \(aster\.hod\): temporary-secret/)).toBeInTheDocument();
    });

    it('shows skipped row details and does not report success when no HOD records were inserted', async () => {
      XLSX.utils.sheet_to_json.mockReturnValue([
        ['User ID', 'First Name', 'Last Name', 'Username', 'Email', 'Phone', 'Role'],
        ['DTU-HOD-005', 'Existing', 'Head', 'existing.hod', 'head@example.edu', '', 'Head of Department'],
      ]);
      api.post.mockRejectedValue({
        response: {
          status: 422,
          data: {
          success: false,
          message: 'No new accounts added. All 1 row were skipped because they already exist in the system.',
          inserted_count: 0,
          skipped_count: 1,
          skipped: [{
            row: 2,
            id_number: 'DTU-HOD-005',
            reason: 'Skipped because user ID already exists. Existing HOD account DTU-HOD-005 and its department assignment were left unchanged.',
          }],
          },
        },
      });
      const onImportSuccess = jest.fn();

      const { container } = render(<DataImport onImportSuccess={onImportSuccess} />);
      fireEvent.change(container.querySelector('input[type="file"]'), {
        target: { files: [{ name: 'users.csv', arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)) }] },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Preview File' }));
      await screen.findByText('DTU-HOD-005');
      fireEvent.click(await screen.findByRole('button', { name: 'Save to System' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('No new accounts added. All 1 row were skipped because they already exist in the system.');
      expect(screen.getByRole('alert')).toHaveClass('bg-red-100', 'text-red-800', 'border-red-300');
      expect(screen.getByRole('alert')).not.toHaveClass('bg-green-100', 'text-green-800', 'border-green-300');
      expect(screen.getByRole('alert')).not.toHaveTextContent('Row 2:');
      expect(screen.getByRole('alert')).not.toHaveTextContent('department assignment were left unchanged.');
      expect(onImportSuccess).not.toHaveBeenCalled();
    });
  });

  it('imports the stream column as supplied in the standard CSV', () => {
    const result = parseStudentImportGrid([
      ['First Name', 'Last Name', 'Email', 'Stream'],
      ['Aster', 'Mekonnen', 'aster@example.com', 'Natural Science'],
    ]);

    expect(result.rows).toEqual([
      expect.objectContaining({
        first_name: 'Aster',
        last_name: 'Mekonnen',
        email: 'aster@example.com',
        stream: 'Natural Science',
      }),
    ]);
  });

  it('maps score aliases and leaves blank scores empty for safe updates', () => {
    const result = parseStudentImportGrid([
      ['Student ID', 'First Name', 'Last Name', 'GPA (4.0)', 'Grade 12', 'COC Score', 'Stream'],
      ['DTU16R1004', 'Marta', 'Tadesse', '3.6', '82', '27', 'Natural Science'],
      ['DTU16R1005', 'Dawit', 'Girma', '', '', '', 'Social Science'],
    ]);

    expect(result.rows[0]).toEqual(expect.objectContaining({
      gpa: '3.6',
      grade_12_result: '82',
      coc_result: '27',
      stream: 'Natural Science',
    }));
    expect(result.rows[1]).toEqual(expect.objectContaining({
      gpa: '',
      grade_12_result: '',
      coc_result: '',
      stream: 'Social Science',
    }));
  });
});
