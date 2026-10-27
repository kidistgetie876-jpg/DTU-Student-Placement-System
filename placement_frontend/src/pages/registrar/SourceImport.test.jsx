import { parseSourceImportGrid } from './SourceImport.jsx';
import { ministryImportColumns } from './MinistryImport.jsx';
import { simsImportColumns } from './SIMSImport.jsx';

describe('source import spreadsheet formats', () => {
  it('parses the official MoSHE columns, ignoring title rows and header casing', () => {
    const parsed = parseSourceImportGrid([
      ['Debre Tabor University MoSHE Placement File'],
      ministryImportColumns.map(({ header }) => header.toUpperCase()),
      ['DTU/001', 'Afar', 'Sara', 'Kebede', 'Abebe', 'Female', '88', 'Yes', 'No', 'Medicine'],
    ], ministryImportColumns);

    expect(parsed.headersFound).toBe(true);
    expect(parsed.rows).toEqual([{
      AdmissionNumber: 'DTU/001',
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
      AdmissionNumber: 'DTU/002',
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

  it('does not accept the deprecated BenefitGroup column in place of Minority and Disability', () => {
    const parsed = parseSourceImportGrid([
      ['AdmissionNumber', 'Region', 'GivenName', 'FatherName', 'GrandFatherName', 'Sex', 'TotalMark', 'BenefitGroup', 'FieldOfStudy'],
      ['DTU/003', 'Afar', 'Sara', 'Kebede', 'Abebe', 'Female', '88', 'Developing Region', 'Medicine'],
    ], ministryImportColumns);

    expect(parsed).toEqual({ headersFound: false, rows: [] });
  });

  it('parses the required SIMS score fields without optional registrar columns', () => {
    const parsed = parseSourceImportGrid([
      simsImportColumns.map(({ header }) => header),
      ['DTU/001', '3.5', '24'],
    ], simsImportColumns);

    expect(parsed.headersFound).toBe(true);
    expect(parsed.rows[0]).toEqual({
      'Student ID': 'DTU/001',
      CGPA: '3.5',
      'COC Score': '24',
    });
    expect(parseSourceImportGrid([
      ['admission_number', 'CGPA', 'COC Score'],
      ['DTU/002', '3.2', '21'],
    ], simsImportColumns)).toEqual({
      headersFound: true,
      rows: [{ 'Student ID': 'DTU/002', CGPA: '3.2', 'COC Score': '21' }],
    });
    expect(parseSourceImportGrid([['Student ID', 'CGPA']], simsImportColumns))
      .toEqual({ headersFound: false, rows: [] });
  });
});
