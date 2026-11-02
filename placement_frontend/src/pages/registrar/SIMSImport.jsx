import React from 'react';
import SourceImport from './SourceImport.jsx';

export const simsImportColumns = [
  { header: 'Student ID', aliases: ['university_student_id', 'student_id', 'moe_admission_number', 'admission_number', 'AdmissionNumber'] },
  { header: 'CGPA' },
  { header: 'COC Score' },
];

const SIMSImport = ({ onImportSuccess }) => (
  <SourceImport
    title="Registrar SIMS Import"
    endpoint="api/registrar/import_sims.php"
    columns={simsImportColumns}
    onImportSuccess={onImportSuccess}
  />
);

export default SIMSImport;
