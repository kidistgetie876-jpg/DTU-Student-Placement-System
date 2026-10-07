import React, { useRef, useState } from 'react';
import api from '../../services/api.js';
import * as XLSX from 'xlsx';

const DataImport = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewReady, setPreviewReady] = useState(false);
  const fileInputRef = useRef(null);

  // 1. ኮለሞችን ወደ ዳታቤዝ ስም መቀየሪያ (Normalization)
  const normalizeCSVRow = (row) => {
    const normalized = {};
    Object.entries(row).forEach(([key, value]) => {
      const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      normalized[cleanKey] = String(value ?? '').trim();
    });
    
    return {
      first_name: normalized.first_name || normalized.firstname || '',
      last_name: normalized.last_name || normalized.lastname || '',
      username: normalized.username || normalized.name || '',
      email: normalized.email || '',
      phone: normalized.phone || normalized.phone_number || '',
      gpa: normalized.gpa || '0',
      stream: normalized.stream || '',
      gender: normalized.gender || 'Not specified',
      grade_12_result: normalized.grade_12_result || normalized.grade12 || '0',
      coc_result: normalized.coc_result || normalized.coc || '0',
      disability: normalized.disability || 'No',
      minority: normalized.minority || 'No'
    };
  };

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
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
      
      const normalizedData = rows.map(normalizeCSVRow).filter(row => (
        row.email !== '' && (row.first_name !== '' || row.last_name !== '' || row.username !== '')
      ));

      if (normalizedData.length === 0) {
        throw new Error("ምንም ትክክለኛ የተማሪ ዳታ አልተገኘም።");
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
        email: row.email || '',
        phone: row.phone || '',
        gpa: row.gpa || '0',
        stream: row.stream || '',
        gender: row.gender || 'Not specified',
        grade_12_result: row.grade_12_result || '0',
        coc_result: row.coc_result || '0',
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
        setStatusMessage(responseData.message || `Import complete: ${insertedCount} new, ${updatedCount} updated, ${skippedCount} skipped.`);
        setPreviewRows([]);
        setPreviewReady(false);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        setStatusType('error');
        setStatusMessage(responseData.message || responseData.error || 'No students were imported. Check the backend response.');
      }
    } catch (error) {
      setStatusType('error');
      setStatusMessage(error.response?.data?.message || 'Server connection error. Please check XAMPP.');
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
                    <th>First Name</th><th>Last Name</th><th>Username</th><th>Email</th><th>Phone</th><th>GPA</th><th>Stream</th><th>Gender</th><th>G12</th><th>COC</th><th>Disability</th><th>Minority</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      <td>{row.first_name}</td><td>{row.last_name}</td><td>{row.username}</td><td>{row.email}</td><td>{row.phone}</td><td>{row.gpa}</td>
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