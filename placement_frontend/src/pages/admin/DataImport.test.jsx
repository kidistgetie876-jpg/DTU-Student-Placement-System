import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../../services/api.js';
import DataImport from './DataImport.jsx';
import * as XLSX from 'xlsx';

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

describe('DataImport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    XLSX.read.mockReturnValue({
      SheetNames: ['Students'],
      Sheets: { Students: {} },
    });
    XLSX.utils.sheet_to_json.mockReturnValue([{
      Student_ID: 'DTU16R1001',
      First_Name: 'Marta',
      Last_Name: 'Kebede',
      Username: 'marta',
      GPA: '',
      G12_Result: '70',
      COC: '25',
    }]);
    api.post.mockResolvedValue({
      data: { success: true, inserted_count: 1, updated_count: 0, skipped_count: 0 },
    });
  });

  it('imports the registrar student template without email and refreshes the student list', async () => {
    const onImported = jest.fn();
    const { container } = render(<DataImport onImported={onImported} />);

    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['student data'], 'students.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(0) });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview File' }));

    expect(await screen.findByText('Marta')).toBeInTheDocument();
    expect(XLSX.read).toHaveBeenCalled();
    expect(fileInput).toHaveAttribute('accept', '.csv,.xls,.xlsx');
    fireEvent.click(screen.getByRole('button', { name: 'Save to System' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('api/admin/import_api.php', {
        students: [{
          id_number: 'DTU16R1001',
          first_name: 'Marta',
          last_name: 'Kebede',
          username: 'marta',
          email: '',
          phone: '',
          gpa: '0',
          stream: '',
          gender: 'Not specified',
          grade_12_result: '70',
          coc_result: '25',
          disability: 'No',
          minority: 'No',
        }],
      });
    });
    expect(onImported).toHaveBeenCalledTimes(1);
  });
});
