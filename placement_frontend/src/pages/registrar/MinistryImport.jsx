import React from 'react';
import SourceImport from './SourceImport.jsx';

export const ministryImportColumns = [
  { header: 'AdmissionNumber', aliases: ['admission_number'] },
  { header: 'Region', aliases: ['region'] },
  { header: 'GivenName', aliases: ['given_name'] },
  { header: 'FatherName', aliases: ['father_name'] },
  { header: 'GrandFatherName', aliases: ['GrandfatherName', 'grandfather_name'] },
  { header: 'Sex', aliases: ['sex'] },
  { header: 'TotalMark', aliases: ['total_mark'] },
  { header: 'Minority', aliases: ['minority'] },
  { header: 'Disability', aliases: ['disability'] },
  { header: 'FieldOfStudy', aliases: ['FieldOfstudy', 'field_of_study'] },
];

const MinistryImport = ({ onImportSuccess }) => (
  <SourceImport
    title="MoSHE Student Import"
    endpoint="api/registrar/import_moshe.php"
    columns={ministryImportColumns}
    onImportSuccess={onImportSuccess}
  />
);

export default MinistryImport;
