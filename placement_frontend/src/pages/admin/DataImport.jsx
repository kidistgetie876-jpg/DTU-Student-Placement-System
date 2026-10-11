import React, { useRef, useState } from 'react';
import api from '../../services/api.js';
import * as XLSX from 'xlsx';

const normalizeHeader = (header) => String(header ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const studentImportHeaders = {
  idNumber: ['idnumber', 'studentid', 'studentnumber'],
  email: ['email', 'emailaddress', 'studentemail', 'studentemailaddress', 'emailid'],
  firstName: ['firstname', 'studentfirstname', 'givenname'],
  lastName: ['lastname', 'studentlastname', 'surname', 'familyname'],
  fullName: ['fullname', 'studentname', 'name'],
  username: ['username', 'loginname'],
  phone: ['phone', 'phonenumber', 'mobilenumber', 'mobile'],
  gpa: ['gpa', 'gpa40', 'cgpa', 'cumulativegpa'],
  stream: ['stream'],
  gender: ['gender'],
  grade12: ['grade12result', 'grade12', 'grade12score', 'g12result', 'g12score', 'g12'],
  coc: ['cocresult', 'cocscore', 'coc', 'competencyexamresult'],
  disability: ['disability', 'hasdisability'],
  minority: ['minority', 'isminority'],
};

const getHeaderIndex = (headerRow, aliases) => headerRow.findIndex((header) => aliases.includes(normalizeHeader(header)));

export const parseStudentImportGrid = (grid) => {
  const headerRowIndex = grid.slice(0, 10).findIndex((row) => {
    const emailIndex = getHeaderIndex(row, studentImportHeaders.email);
    const hasIdentifier = [
      ...studentImportHeaders.idNumber,
      ...studentImportHeaders.username,
    ].some((alias) => getHeaderIndex(row, [alias]) >= 0);
    const hasNameColumn = [
      ...studentImportHeaders.firstName,
      ...studentImportHeaders.lastName,
      ...studentImportHeaders.fullName,
      ...studentImportHeaders.username,
    ].some((alias) => getHeaderIndex(row, [alias]) >= 0);
    return (emailIndex >= 0 || hasIdentifier) && hasNameColumn;
  });

  if (headerRowIndex < 0) {
    return { rows: [], headersFound: false };
  }

  const headers = grid[headerRowIndex];
  const getCell = (row, aliases) => {
    const index = getHeaderIndex(headers, aliases);
    return index < 0 ? '' : String(row[index] ?? '').trim();
  };
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const rows = grid.slice(headerRowIndex + 1).map((row) => {
    let firstName = getCell(row, studentImportHeaders.firstName);
    let lastName = getCell(row, studentImportHeaders.lastName);
    const fullName = getCell(row, studentImportHeaders.fullName);
    if (!firstName && !lastName && fullName) {
      const nameParts = fullName.split(/\s+/);
      firstName = nameParts.shift() || '';
      lastName = nameParts.join(' ');
    }

    const email = getCell(row, studentImportHeaders.email);
    const username = getCell(row, studentImportHeaders.username)
      || (emailPattern.test(email) ? email.split('@')[0] : '');
    return {
      id_number: getCell(row, studentImportHeaders.idNumber),
      first_name: firstName,
      last_name: lastName,
      username,
      email,
      phone: getCell(row, studentImportHeaders.phone),
      gpa: getCell(row, studentImportHeaders.gpa),
      stream: getCell(row, studentImportHeaders.stream),
      gender: getCell(row, studentImportHeaders.gender) || 'Not specified',
      grade_12_result: getCell(row, studentImportHeaders.grade12),
      coc_result: getCell(row, studentImportHeaders.coc),
      disability: getCell(row, studentImportHeaders.disability) || 'No',
      minority: getCell(row, studentImportHeaders.minority) || 'No',
    };
  }).filter((row) => (
    (emailPattern.test(row.email) || row.id_number || row.username)
    && (row.first_name || row.last_name || row.username)
  ));

  return { rows, headersFound: true };
};

const DataImport = ({ onImportSuccess }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewReady, setPreviewReady] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setSelectedFile(file || null);
    setPreviewReady(false);
    setPreviewRows([]);
    setStatusMessage('');
  };

  // 2. ፋይሉን አንብቦ ፕሪቪው ማሳያ
  const handlePreview = async () => {
    const file = selectedFile || fileInputRef.current?.files?.[0];
    if (!file) {
      setStatusType('error');
      setStatusMessage('እባክዎ መጀመሪያ ፋይል ይምረጡ።');
      return;
    }

    try {
      const dataBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(dataBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('The selected workbook does not contain a worksheet.');
      const firstSheet = workbook.Sheets[firstSheetName];
      const grid = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false });
      const { rows: normalizedData, headersFound } = parseStudentImportGrid(grid);

      if (normalizedData.length === 0) {
        if (!headersFound) {
          throw new Error('Could not identify the required columns. Include an Email/Email Address column and a First Name, Last Name, Full Name, Student Name, or Username column.');
        }
        throw new Error('No valid student rows found. Check that each row has a valid email address and student name or username.');
      }

      setPreviewRows(normalizedData);
      setPreviewReady(true);
      setStatusType('info');
      setStatusMessage(`ፕሪቪው ተዘጋጅቷል (${normalizedData.length} ተማሪዎች)።`);
    } catch (error) {
      setStatusType('error');
      setStatusMessage(error.message || 'ፋይሉን ማንበብ አልተቻለም።');
    }
  };

  // 3. ዳታውን ወደ ባክኤንድ መላኪያ
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!previewReady || previewRows.length === 0) {
      setStatusType('error');
      setStatusMessage('እባክዎ ፋይሉን ይምረጡ እና preview ያድርጉ።');
      return;
    }

    setSubmitting(true);
    setStatusMessage('');

    try {
      const students = previewRows.map(row => ({
        first_name: row.first_name || '',
        last_name: row.last_name || '',
        username: row.username || row.email.split('@')[0],
        id_number: row.id_number || '',
        email: row.email || '',
        phone: row.phone || '',
        gpa: row.gpa || '',
        stream: row.stream || '',
        gender: row.gender || 'Not specified',
        grade_12_result: row.grade_12_result || '',
        coc_result: row.coc_result || '',
        disability: row.disability || 'No',
        minority: row.minority || 'No',
      }));

      const response = await api.post('api/admin/import_api.php', { students });
      let responseData = response.data || {};
      if (typeof responseData === 'string') {
        try {
          responseData = JSON.parse(responseData);
        } catch (parseError) {
          responseData = { success: false, message: responseData };
        }
      }

      const importSucceeded = responseData.success === true
        || responseData.success === 'true'
        || responseData.status === 'success'
        || responseData.status === 'ok';
      const importedCount = Number(responseData.imported_count ?? responseData.imported ?? responseData.count ?? 0);

      if (importSucceeded) {
        setStatusType('success');
        const insertedCount = Number(responseData.inserted_count ?? importedCount);
        const updatedCount = Number(responseData.updated_count ?? 0);
        const skippedCount = Number(responseData.skipped_count ?? 0);
        const skippedDetails = Array.isArray(responseData.skipped)
          ? responseData.skipped
            .map((item) => `Row ${item.row}: ${item.reason}`)
            .join(' ')
          : '';
        setStatusMessage([
          responseData.message || `Import complete: ${insertedCount} new, ${updatedCount} updated, ${skippedCount} skipped.`,
          skippedDetails,
        ].filter(Boolean).join(' '));
        setPreviewRows([]);
        setPreviewReady(false);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        onImportSuccess?.();
      } else {
        setStatusType('error');
        setStatusMessage(responseData.message || responseData.error || 'No students were imported. Check the backend response.');
      }
    } catch (error) {
      setStatusType('error');
      setStatusMessage(
        error.response?.data?.message
          || (error.response
            ? `Import request failed with HTTP ${error.response.status}.`
            : 'Server connection error. Please check XAMPP.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="card p-4 shadow-sm border-0 rounded-4">
        <h4 className="fw-bold mb-3 text-primary">Student Data Bulk Import</h4>
        
        {statusMessage && (
          <div className={`alert ${statusType === 'success' ? 'alert-success' : 'alert-danger'} mb-4`}>
            {statusMessage}
          </div>
        )}
        
        <p className="text-muted small mb-2">
          Match existing students by Student ID or username; new accounts require an email address. Common headers such as Student ID, Email Address, Student Name, Given Name, and Surname are supported.
        </p>
        <input ref={fileInputRef} type="file" accept=".csv,.xls,.xlsx" className="form-control mb-3" onChange={handleFileChange} />
        
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary px-4 rounded-pill" onClick={handlePreview}>Preview File</button>
          <button className="btn btn-primary px-4 rounded-pill shadow" onClick={handleSubmit} disabled={!previewReady || submitting}>
            {submitting ? 'Saving...' : 'Save to System'}
          </button>
        </div>

        {previewReady && (
          <div className="mt-4">
            <h5 className="fw-bold">Preview (Sample)</h5>
            <div className="table-responsive rounded-3 border">
              <table className="table table-sm table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Student ID</th><th>First Name</th><th>Last Name</th><th>Username</th><th>Email</th><th>Phone</th><th>GPA</th><th>Stream</th><th>Gender</th><th>G12</th><th>COC</th><th>Disability</th><th>Minority</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      <td>{row.id_number}</td><td>{row.first_name}</td><td>{row.last_name}</td><td>{row.username}</td><td>{row.email}</td><td>{row.phone}</td><td>{row.gpa}</td>
                      <td>{row.stream}</td><td>{row.gender}</td><td>{row.grade_12_result}</td><td>{row.coc_result}</td><td>{row.disability}</td><td>{row.minority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewRows.length > 10 && <p className="small text-muted mt-2">... and {previewRows.length - 10} more students.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataImport;