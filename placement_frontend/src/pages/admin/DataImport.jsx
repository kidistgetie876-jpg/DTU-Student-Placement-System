import React, { useRef, useState } from 'react';
import api from '../../services/api.js';
import * as XLSX from 'xlsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

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

const userImportHeaders = {
  id: ['idnumber', 'userid', 'usernumber', 'useridentifier', 'staffid'],
  email: ['email', 'emailaddress'],
  firstName: ['firstname', 'givenname'],
  lastName: ['lastname', 'surname', 'familyname'],
  fullName: ['fullname', 'name'],
  username: ['username', 'loginname'],
  phone: ['phone', 'phonenumber', 'mobilenumber', 'mobile'],
  role: ['role', 'userrole', 'accounttype'],
  password: ['password', 'temppassword'],
};

const getHeaderIndex = (headerRow, aliases) => headerRow.findIndex((header) => aliases.includes(normalizeHeader(header)));

export const parseUserImportGrid = (grid) => {
  const headerRowIndex = grid.slice(0, 10).findIndex((row) => {
    const hasRole = getHeaderIndex(row, userImportHeaders.role) >= 0;
    const hasUserId = getHeaderIndex(row, userImportHeaders.id) >= 0;
    const hasUserNameOrEmail = getHeaderIndex(row, userImportHeaders.username) >= 0
      || getHeaderIndex(row, userImportHeaders.email) >= 0;
    const hasStudentFields = [
      ...studentImportHeaders.idNumber,
      ...studentImportHeaders.gpa,
      ...studentImportHeaders.stream,
      ...studentImportHeaders.grade12,
      ...studentImportHeaders.coc,
    ].some((alias) => getHeaderIndex(row, [alias]) >= 0);
    const hasUserFields = hasUserId || (hasUserNameOrEmail && !hasStudentFields);
    return hasUserFields && (hasRole || !hasStudentFields);
  });

  if (headerRowIndex < 0) {
    return { rows: [], headersFound: false };
  }

  const headers = grid[headerRowIndex];
  const getCell = (row, aliases) => {
    const index = getHeaderIndex(headers, aliases);
    return index < 0 ? '' : String(row[index] ?? '').trim();
  };
  const rows = grid.slice(headerRowIndex + 1).map((row) => {
    let firstName = getCell(row, userImportHeaders.firstName);
    let lastName = getCell(row, userImportHeaders.lastName);
    const fullName = getCell(row, userImportHeaders.fullName);
    if (!firstName && !lastName && fullName) {
      const nameParts = fullName.split(/\s+/);
      firstName = nameParts.shift() || '';
      lastName = nameParts.join(' ');
    }

    return {
      id_number: getCell(row, userImportHeaders.id),
      first_name: firstName,
      last_name: lastName,
      username: getCell(row, userImportHeaders.username),
      email: getCell(row, userImportHeaders.email),
      phone: getCell(row, userImportHeaders.phone),
      role: getCell(row, userImportHeaders.role),
      password: getCell(row, userImportHeaders.password),
    };
  }).filter((row) => (
    row.first_name || row.last_name || row.username || row.id_number
  ));

  return { rows, headersFound: true };
};

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
  const { t } = useLanguage();
  const [selectedFile, setSelectedFile] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewType, setPreviewType] = useState('student');
  const [previewReady, setPreviewReady] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setSelectedFile(file || null);
    setPreviewReady(false);
    setPreviewRows([]);
    setPreviewType('student');
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
      const userImport = parseUserImportGrid(grid);
      const importType = userImport.headersFound ? 'user' : 'student';
      const { rows: normalizedData, headersFound } = importType === 'user'
        ? userImport
        : parseStudentImportGrid(grid);

      if (normalizedData.length === 0) {
        if (!headersFound) {
          throw new Error('Could not identify the required columns. Include student fields (such as Student ID, GPA, or Stream) or user fields (such as User ID, Role, Username, and Email).');
        }
        throw new Error(`No valid ${importType === 'user' ? 'user' : 'student'} rows found. Check that rows include a name or username and the required identity fields.`);
      }

      setPreviewRows(normalizedData);
      setPreviewType(importType);
      setPreviewReady(true);
      setStatusType('info');
      const itemLabel = importType === 'user' ? 'user' : 'student';
      setStatusMessage(`Preview ready: ${normalizedData.length} ${itemLabel}${normalizedData.length === 1 ? '' : 's'}.`);
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
      const importRows = previewRows.map(row => ({
        first_name: row.first_name || '',
        last_name: row.last_name || '',
        username: row.username || (row.email ? row.email.split('@')[0] : ''),
        id_number: row.id_number || '',
        email: row.email || '',
        phone: row.phone || '',
        ...(previewType === 'student' ? {
          gpa: row.gpa || '',
          stream: row.stream || '',
          gender: row.gender || 'Not specified',
          grade_12_result: row.grade_12_result || '',
          coc_result: row.coc_result || '',
          disability: row.disability || 'No',
          minority: row.minority || 'No',
        } : { role: row.role || '', password: row.password || '' }),
      }));

      const isUserImport = previewType === 'user';
      const response = await api.post(
        isUserImport ? 'api/admin/import_users.php' : 'api/admin/import_api.php',
        isUserImport ? { users: importRows } : { students: importRows },
      );
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
      const temporaryCredentials = Array.isArray(responseData.temporary_passwords)
        ? responseData.temporary_passwords
          .map((item) => `${item.id_number} (${item.username}): ${item.password}`)
          .join('; ')
        : '';

      if (importSucceeded) {
        setStatusType('success');
        const insertedCount = Number(responseData.inserted_count ?? importedCount);
        const updatedCount = Number(responseData.updated_count ?? 0);
        const skippedCount = Number(responseData.skipped_count ?? 0);
        const unchangedCount = Number(responseData.unchanged_count ?? 0);
        const summaryMessage = `Import complete: ${insertedCount} new, ${updatedCount} updated, ${skippedCount} skipped${unchangedCount > 0 ? ` (${unchangedCount} already exist, unchanged)` : ''}.`;
        setStatusMessage([
          responseData.message || summaryMessage,
          temporaryCredentials ? `Temporary passwords: ${temporaryCredentials}` : '',
        ].filter(Boolean).join(' '));
        setPreviewRows([]);
        setPreviewType('student');
        setPreviewReady(false);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        onImportSuccess?.();
      } else {
        setStatusType('error');
        setStatusMessage([
          responseData.message || responseData.error || `No ${isUserImport ? 'users' : 'students'} were imported. Check the backend response.`,
        ].filter(Boolean).join(' '));
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
        <h4 className="fw-bold mb-3 text-primary">{t(previewType === 'user' ? 'User/HOD Data Bulk Import' : 'Student Data Bulk Import')}</h4>
        
        {statusMessage && (
          <div
            className={`alert mb-4 ${
              statusType === 'error'
                ? 'alert-danger bg-red-100 text-red-800 border-red-300'
                : 'alert-success bg-green-100 text-green-800 border-green-300'
            }`}
            role={statusType === 'error' ? 'alert' : 'status'}
            aria-live={statusType === 'error' ? 'assertive' : 'polite'}
          >
            {statusMessage}
          </div>
        )}
        
        <p className="text-muted small mb-2">
          {t('Student files are matched by Student ID or username. User/HOD files are detected by User ID or Role headers and imported separately. New accounts require a valid email address.')}
        </p>
        <input ref={fileInputRef} type="file" accept=".csv,.xls,.xlsx" className="form-control mb-3" onChange={handleFileChange} />
        
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary px-4 rounded-pill" onClick={handlePreview}>{t('Preview File')}</button>
          <button className="btn btn-primary px-4 rounded-pill shadow" onClick={handleSubmit} disabled={!previewReady || submitting}>
            {submitting ? t('Saving...') : t('Save to System')}
          </button>
        </div>

        {previewReady && (
          <div className="mt-4">
            <h5 className="fw-bold">{t('Preview (Sample)')}</h5>
            <div className="table-responsive rounded-3 border">
              <table className="table table-sm table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    {previewType === 'user' ? (
                      <>
                        <th>{t('USER ID')}</th><th>{t('FIRST NAME')}</th><th>{t('LAST NAME')}</th><th>{t('USERNAME')}</th><th>{t('EMAIL')}</th><th>{t('PHONE')}</th><th>{t('ROLE')}</th>
                      </>
                    ) : (
                      <>
                        <th>{t('Student ID')}</th><th>{t('First Name')}</th><th>{t('Last Name')}</th><th>{t('Username')}</th><th>{t('Email')}</th><th>{t('Phone')}</th><th>GPA</th><th>{t('Stream')}</th><th>{t('Gender')}</th><th>G12</th><th>COC</th><th>Disability</th><th>Minority</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {previewType === 'user' ? (
                        <>
                          <td>{row.id_number}</td><td>{row.first_name}</td><td>{row.last_name}</td><td>{row.username}</td><td>{row.email}</td><td>{row.phone}</td><td>{row.role}</td>
                        </>
                      ) : (
                        <>
                          <td>{row.id_number}</td><td>{row.first_name}</td><td>{row.last_name}</td><td>{row.username}</td><td>{row.email}</td><td>{row.phone}</td><td>{row.gpa}</td>
                          <td>{row.stream}</td><td>{row.gender}</td><td>{row.grade_12_result}</td><td>{row.coc_result}</td><td>{row.disability}</td><td>{row.minority}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewRows.length > 10 && <p className="small text-muted mt-2">... and {previewRows.length - 10} more {previewType === 'user' ? 'users' : 'students'}.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataImport;