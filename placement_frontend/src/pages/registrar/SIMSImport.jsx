import React from 'react';
import SourceImport from './SourceImport.jsx';

export const simsImportColumns = [
  { header: 'Student ID', aliases: ['university_student_id', 'student_id'], requiredGroup: 'student_identifier' },
  {
    header: 'Admission Number',
    aliases: ['moe_admission_number', 'admission_number', 'AdmissionNumber', 'admission', 'admission_'],
    requiredGroup: 'student_identifier',
  },
  { header: 'CGPA' },
  { header: 'COC Score' },
];

export const normalizeSimsImportRows = (rows) => rows.map((row) => {
  const studentId = String(row['Student ID'] || '').trim();
  const admissionNumber = String(row['Admission Number'] || '').trim();
  const isUniversityStudentId = /^DTU16R\d+$/i.test(admissionNumber)
    || /^DTU\d{2}[A-Z]\d+$/i.test(admissionNumber);

  if (studentId || !isUniversityStudentId) return row;

  return {
    ...row,
    'Student ID': admissionNumber,
    'Admission Number': '',
  };
});

const SIMSImport = ({ onImportSuccess }) => (
  <SourceImport
    title="Registrar SIMS Import"
    endpoint="api/registrar/import_sims.php"
    columns={simsImportColumns}
    normalizeRows={normalizeSimsImportRows}
    onImportSuccess={onImportSuccess}
  />
);

export default SIMSImport;
