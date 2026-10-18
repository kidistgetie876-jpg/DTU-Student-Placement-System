import React from 'react';
import SourceImport from './SourceImport.jsx';

export const ministryImportColumns = [
  { header: 'AdmissionNumber' },
  { header: 'Region' },
  { header: 'GivenName' },
  { header: 'FatherName' },
  { header: 'GrandFatherName' },
  { header: 'Sex' },
  { header: 'TotalMark' },
  { header: 'BenefitGroup' },
  { header: 'FieldOfstudy' },
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
