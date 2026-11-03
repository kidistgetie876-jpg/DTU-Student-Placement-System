import { parseSourceImportCsv, parseSourceImportGrid } from './SourceImport.jsx';
import { ministryImportColumns } from './MinistryImport.jsx';
import { normalizeSimsImportRows, simsImportColumns } from './SIMSImport.jsx';

describe('source import spreadsheet formats', () => {
  it('parses the official MoSHE columns, ignoring title rows and header casing', () => {
    const parsed = parseSourceImportGrid([
      ['Debre Tabor University MoSHE Placement File'],
      ministryImportColumns.map(({ header }) => header.toUpperCase()),
      ['DTU/001', 'Afar', 'Sara', 'Kebede', 'Abebe', 'Female', '88', 'Yes', 'No', 'Medicine'],
    ], ministryImportColumns);

    expect(parsed.headersFound).toBe(true);
    expect(parsed.rows).toEqual([{
      moe_admission_number: 'DTU/001',
      Region: 'Afar',
      GivenName: 'Sara',
      FatherName: 'Kebede',
      GrandFatherName: 'Abebe',
      Sex: 'Female',
      TotalMark: '88',
      Minority: 'Yes',
      Disability: 'No',
      FieldOfStudy: 'Medicine',
    }]);
  });

  it('accepts case-insensitive snake_case MoSHE headers from CSV exports', () => {
    const parsed = parseSourceImportGrid([
      ['ADMISSION_NUMBER', 'Region', 'given_name', 'FATHER_NAME', 'grandfather_name', 'SEX', 'total_mark', 'minority', 'DISABILITY', 'field_of_study'],
      ['DTU/002', 'Amhara', 'Abebe', 'Kebede', 'Tadesse', 'Male', '480', 'No', 'Yes', 'Engineering'],
    ], ministryImportColumns);

    expect(parsed.headersFound).toBe(true);
    expect(parsed.rows[0]).toEqual({
      moe_admission_number: 'DTU/002',
      Region: 'Amhara',
      GivenName: 'Abebe',
      FatherName: 'Kebede',
      GrandFatherName: 'Tadesse',
      Sex: 'Male',
      TotalMark: '480',
      Minority: 'No',
      Disability: 'Yes',
      FieldOfStudy: 'Engineering',
    });
  });

  it('detects semicolon-delimited CSV and preserves commas inside quoted values', () => {
    const parsed = parseSourceImportCsv(
      'moe_admission_number;Region;GivenName;FatherName;GrandFatherName;Sex;TotalMark;Minority;Disability;FieldOfStudy\r\n'
      + 'MOE-004;Amhara;Sara;"Kebede, Jr.";Abebe;Female;88;Yes;No;Medicine',
      ministryImportColumns,
    );

    expect(parsed.headersFound).toBe(true);
    expect(parsed.rows[0]).toEqual({
      moe_admission_number: 'MOE-004',
      Region: 'Amhara',
      GivenName: 'Sara',
      FatherName: 'Kebede, Jr.',
      GrandFatherName: 'Abebe',
      Sex: 'Female',
      TotalMark: '88',
      Minority: 'Yes',
      Disability: 'No',
      FieldOfStudy: 'Medicine',
    });
  });

  it('reports the source row number when values do not match the header column count', () => {
    expect(() => parseSourceImportGrid([
      ministryImportColumns.map(({ header }) => header),
      ['MOE-005', 'Amhara', 'Sara', 'Kebede', 'Abebe', 'Female', '88', 'Yes', 'No'],
    ], ministryImportColumns)).toThrow(
      'Row 2 has 9 columns; the header has 10. Check for missing or extra delimiters.',
    );
  });

  it('does not accept the deprecated BenefitGroup column in place of Minority and Disability', () => {
    const parsed = parseSourceImportGrid([
      ['AdmissionNumber', 'Region', 'GivenName', 'FatherName', 'GrandFatherName', 'Sex', 'TotalMark', 'BenefitGroup', 'FieldOfStudy'],
      ['DTU/003', 'Afar', 'Sara', 'Kebede', 'Abebe', 'Female', '88', 'Developing Region', 'Medicine'],
    ], ministryImportColumns);

    expect(parsed).toEqual({ headersFound: false, rows: [] });
  });

  it('parses the required SIMS score fields without optional registrar columns', () => {
    const parsed = parseSourceImportGrid([
      ['Student ID', 'CGPA', 'COC Score'],
      ['DTU/001', '3.5', '24'],
    ], simsImportColumns);

    expect(parsed.headersFound).toBe(true);
    expect(parsed.rows[0]).toEqual({
      'Student ID': 'DTU/001',
      'Admission Number': '',
      CGPA: '3.5',
      'COC Score': '24',
    });
    expect(parseSourceImportGrid([
      ['admission_number', 'CGPA', 'COC Score'],
      ['DTU/002', '3.2', '21'],
    ], simsImportColumns)).toEqual({
      headersFound: true,
      rows: [{ 'Student ID': '', 'Admission Number': 'DTU/002', CGPA: '3.2', 'COC Score': '21' }],
    });
    expect(parseSourceImportGrid([['Student ID', 'CGPA']], simsImportColumns))
      .toEqual({ headersFound: false, rows: [] });
  });

  it('keeps University and Ministry identifiers separate for partial SIMS imports', () => {
    const parsed = parseSourceImportGrid([
      ['student_id', 'admission_number', 'CGPA', 'COC Score'],
      ['DTU16R2021', 'MOE10021', '3.2', '21'],
    ], simsImportColumns);

    expect(parsed.rows).toEqual([{
      'Student ID': 'DTU16R2021',
      'Admission Number': 'MOE10021',
      CGPA: '3.2',
      'COC Score': '21',
    }]);
  });

  it('does not treat a University Student ID as a Ministry Admission Number', () => {
    const parsed = parseSourceImportGrid([
      ['Student ID', 'CGPA', 'COC Score'],
      ['DTU16R2021', '3.2', '21'],
    ], simsImportColumns);

    expect(parsed.rows).toEqual([{
      'Student ID': 'DTU16R2021',
      'Admission Number': '',
      CGPA: '3.2',
      'COC Score': '21',
    }]);
  });

  it('moves a University ID mislabeled as admission_number into the Student ID preview field', () => {
    const parsed = parseSourceImportGrid([
      ['admission_number', 'CGPA', 'COC Score'],
      ['DTU16R2021', '3.2', '21'],
    ], simsImportColumns);

    expect(normalizeSimsImportRows(parsed.rows)).toEqual([{
      'Student ID': 'DTU16R2021',
      'Admission Number': '',
      CGPA: '3.2',
      'COC Score': '21',
    }]);
  });

  it('preserves actual Ministry admission numbers in the admission column', () => {
    const parsed = parseSourceImportGrid([
      ['admission_number', 'CGPA', 'COC Score'],
      ['MOE10021', '3.2', '21'],
    ], simsImportColumns);

    expect(normalizeSimsImportRows(parsed.rows)).toEqual([{
      'Student ID': '',
      'Admission Number': 'MOE10021',
      CGPA: '3.2',
      'COC Score': '21',
    }]);
  });
});
