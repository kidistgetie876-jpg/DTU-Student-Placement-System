import { parseStudentImportGrid } from './DataImport.jsx';

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
