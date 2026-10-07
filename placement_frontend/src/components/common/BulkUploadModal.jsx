import React, { useState, useRef } from 'react';
import api from '../../services/api.js';
import * as XLSX from 'xlsx';

const BulkUploadModal = ({ isOpen, onClose, onSuccess, departments = [] }) => {
  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [preview, setPreview] = useState([]);
  const [step, setStep] = useState(1); // 1: Upload, 2: Preview, 3: Processing, 4: Results
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({ success: 0, failed: 0, errors: [] });
  const [columnMapping, setColumnMapping] = useState({});
  const fileInputRef = useRef(null);

  const requiredColumns = ['first_name', 'last_name', 'email', 'username', 'gpa', 'gender'];
  const stepLabels = ['Upload File', 'Map Columns', 'Processing', 'Results'];

  const parseCSV = (csvText) => {
    const lines = csvText.split('\n').filter((line) => line.trim());
    if (lines.length < 2) throw new Error('CSV file is empty or contains only headers.');

    const headers = lines[0]
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));

    const rows = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      return obj;
    });

    return { headers, rows };
  };

  const parseExcel = async (selectedFile) => {
    const buffer = await selectedFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error('Excel file does not contain a worksheet.');

    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
    if (rows.length === 0) throw new Error('Excel file is empty or contains only headers.');

    const normalizedRows = rows.map((row) => Object.entries(row).reduce((result, [key, value]) => {
      const normalizedKey = String(key).trim().toLowerCase().replace(/\s+/g, '_');
      result[normalizedKey] = String(value ?? '').trim();
      return result;
    }, {}));

    return { headers: Object.keys(normalizedRows[0]), rows: normalizedRows };
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const isCSV = selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv');
    const isExcel =
      selectedFile.type ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      selectedFile.type === 'application/vnd.ms-excel' ||
      selectedFile.name.endsWith('.xlsx') ||
      selectedFile.name.endsWith('.xls');

    if (!isCSV && !isExcel) {
      alert('Please upload a CSV or Excel file.');
      setFile(null);
      return;
    }

    setFile(selectedFile);
    try {
      const { headers, rows } = isExcel
        ? await parseExcel(selectedFile)
        : parseCSV(await selectedFile.text());
      setData(rows);

      // Auto-detect column mapping
      const mapping = {};
      const lowerHeaders = headers.map((h) => h.toLowerCase());

      requiredColumns.forEach((col) => {
        const found = lowerHeaders.find((h) =>
          h.includes(col.replace('_', '')) ||
          h.includes(col) ||
          (col === 'first_name' && (h.includes('firstname') || h.includes('first'))) ||
          (col === 'last_name' && (h.includes('lastname') || h.includes('last')))
        );
        if (found) {
          mapping[col] = found;
        }
      });

      setColumnMapping(mapping);
      setPreview(rows.slice(0, 5));
      setStep(2);
    } catch (err) {
      alert(`Error parsing file: ${err.message}`);
      setFile(null);
    }
  };

  const handleMappingChange = (requiredCol, selectedHeader) => {
    setColumnMapping((prev) => ({
      ...prev,
      [requiredCol]: selectedHeader,
    }));
  };

  const validateAndPrepareData = () => {
    const prepared = [];
    const errors = [];

    data.forEach((row, index) => {
      const errors_row = [];

      // Check required fields
      if (!columnMapping.first_name || !row[columnMapping.first_name]?.trim()) {
        errors_row.push('First name is required');
      }
      if (!columnMapping.last_name || !row[columnMapping.last_name]?.trim()) {
        errors_row.push('Last name is required');
      }
      if (!columnMapping.email || !row[columnMapping.email]?.trim()) {
        errors_row.push('Email is required');
      }
      if (!columnMapping.username || !row[columnMapping.username]?.trim()) {
        errors_row.push('Username is required');
      }

      // Validate email format
      if (columnMapping.email && row[columnMapping.email]) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row[columnMapping.email])) {
          errors_row.push('Invalid email format');
        }
      }

      // Validate GPA
      if (columnMapping.gpa && row[columnMapping.gpa]) {
        const gpa = Number(row[columnMapping.gpa]);
        if (isNaN(gpa) || gpa < 0 || gpa > 4) {
          errors_row.push('GPA must be between 0 and 4');
        }
      }

      if (errors_row.length > 0) {
        errors.push({ row: index + 2, errors: errors_row.join('; ') });
        return;
      }

      // Prepare data for upload
      prepared.push({
        user_id: undefined,
        username: row[columnMapping.username]?.trim().toLowerCase(),
        email: row[columnMapping.email]?.trim().toLowerCase(),
        first_name: row[columnMapping.first_name]?.trim(),
        last_name: row[columnMapping.last_name]?.trim(),
        full_name: `${row[columnMapping.first_name]?.trim() || ''} ${
          row[columnMapping.last_name]?.trim() || ''
        }`.trim(),
        phone: row[columnMapping.phone]?.trim() || '',
        gender: row[columnMapping.gender]?.trim() || 'Not specified',
        stream: row[columnMapping.stream]?.trim() || '',
        gpa: Number(row[columnMapping.gpa]) || 0,
        grade_12_result: Number(row[columnMapping.grade_12_result]) || 0,
        coc_result: row[columnMapping.coc_result]?.trim() || '',
        disability: row[columnMapping.disability]?.toLowerCase() === 'yes' ? 1 : 0,
        minority: row[columnMapping.minority]?.toLowerCase() === 'yes' ? 1 : 0,
        status: 'Pending',
      });
    });

    return { prepared, errors };
  };

  const handleUpload = async () => {
    const { prepared, errors } = validateAndPrepareData();

    if (errors.length > 0) {
      alert(`Validation errors found:\n${errors.map((e) => `Row ${e.row}: ${e.errors}`).join('\n')}`);
      return;
    }

    if (prepared.length === 0) {
      alert('No valid records to upload.');
      return;
    }

    setStep(3);
    setLoading(true);
    const uploadResults = { success: 0, failed: 0, errors: [] };

    for (const student of prepared) {
      try {
        // Create user account
        const userPayload = {
          username: student.username,
          email: student.email,
          password: Math.random().toString(36).slice(-8), // Generate temp password
          role: 'student',
        };

        const userResponse = await api.post('api/admin/users_api.php', userPayload);
        const createdUser = userResponse.data?.user || userResponse.data?.data || {};
        const userId = Number(
          createdUser.id || createdUser.user_id || createdUser.student_id || 0
        );

        // Update profile
        const profilePayload = {
          user_id: userId || undefined,
          ...student,
        };

        const profileResponse = await api.post('api/common/profile_update.php', profilePayload);
        if (profileResponse.data?.success) {
          uploadResults.success++;
        } else {
          uploadResults.failed++;
          uploadResults.errors.push(`${student.email}: ${profileResponse.data?.message || 'Unknown error'}`);
        }
      } catch (err) {
        uploadResults.failed++;
        uploadResults.errors.push(`${student.email}: ${err.message}`);
      }
    }

    setResults(uploadResults);
    setStep(4);
    setLoading(false);

    if (onSuccess) {
      onSuccess();
    }
  };

  const handleClose = () => {
    setFile(null);
    setData([]);
    setPreview([]);
    setStep(1);
    setColumnMapping({});
    setResults({ success: 0, failed: 0, errors: [] });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const getColumnOptions = () => {
    if (data.length === 0) return [];
    const headers = Object.keys(data[0]);
    return ['', ...headers];
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal d-block"
      style={{
        backgroundColor: 'rgba(9, 18, 33, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div className="modal-dialog modal-lg" style={{ maxWidth: '760px', backgroundColor: 'transparent' }}>
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '20px', overflow: 'hidden' }}>
          <div
            className="modal-header border-0 px-4 py-3"
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)',
              color: 'white',
            }}
          >
            <div>
              <div className="small text-white-50 mb-1">Student Import</div>
              <h5 className="modal-title fw-bold mb-0">
                {step === 1 && 'Upload Student Data'}
                {step === 2 && 'Review & Map Columns'}
                {step === 3 && 'Processing Upload'}
                {step === 4 && 'Upload Results'}
              </h5>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={handleClose}
              disabled={loading}
              aria-label="Close"
            ></button>
          </div>

          <div className="px-4 pt-4 pb-2">
            <div className="d-flex flex-wrap gap-2">
              {stepLabels.map((label, index) => {
                const activeStep = index + 1;
                const isActive = activeStep === step;
                const isDone = activeStep < step;

                return (
                  <div
                    key={label}
                    className={`d-flex align-items-center gap-2 rounded-pill px-3 py-2 ${isActive ? 'text-primary fw-semibold bg-primary-subtle' : isDone ? 'text-success fw-semibold bg-success-subtle' : 'text-muted bg-light'}`}
                    style={{ fontSize: '0.8rem', border: '1px solid rgba(13,110,253,0.12)' }}
                  >
                    <span
                      className={`rounded-circle d-inline-flex align-items-center justify-content-center ${isActive ? 'bg-primary text-white' : isDone ? 'bg-success text-white' : 'bg-secondary-subtle text-muted'}`}
                      style={{ width: '22px', height: '22px', fontSize: '0.72rem', fontWeight: 700 }}
                    >
                      {activeStep}
                    </span>
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="modal-body p-4" style={{ minHeight: '340px' }}>
            {step === 1 && (
              <div>
                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <div className="card border-0 h-100" style={{ backgroundColor: '#f8fafc', borderRadius: '14px' }}>
                      <div className="card-body">
                        <div className="text-primary fw-bold mb-2">Accepted files</div>
                        <div className="small text-muted">CSV, XLSX, and XLS</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="card border-0 h-100" style={{ backgroundColor: '#f8fafc', borderRadius: '14px' }}>
                      <div className="card-body">
                        <div className="text-primary fw-bold mb-2">Required fields</div>
                        <div className="small text-muted">First Name, Last Name, Email, Username, GPA, Gender</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="border border-primary border-2 rounded-4 p-5 text-center"
                  style={{
                    background: 'linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: 'inset 0 0 0 1px rgba(13,110,253,0.06)',
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.background = 'linear-gradient(180deg, #edf5ff 0%, #e3f0ff 100%)';
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%)';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.background = 'linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%)';
                    const droppedFile = e.dataTransfer.files?.[0];
                    if (droppedFile) {
                      const event = { target: { files: [droppedFile] } };
                      handleFileChange(event);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="mb-3" style={{ fontSize: '3rem' }}>📁</div>
                  <h5 className="fw-bold text-primary mb-2">Drag and drop your file here</h5>
                  <p className="text-muted mb-3">or select a file from your device</p>
                  <button
                    type="button"
                    className="btn btn-primary px-4"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    Browse File
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </div>

                {file && (
                  <div className="mt-3 d-flex align-items-center gap-2 rounded-3 p-3 border border-success-subtle bg-success-subtle text-success">
                    <span style={{ fontSize: '1.3rem' }}>✓</span>
                    <div>
                      <div className="fw-semibold">File selected</div>
                      <div className="small">{file.name}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="alert alert-light border mb-3">
                  <strong>{data.length}</strong> records detected. Please map each column to the correct student field before continuing.
                </div>

                <div className="row g-3 mb-4">
                  {requiredColumns.map((col) => (
                    <div key={col} className="col-md-6">
                      <label className="form-label fw-semibold small text-uppercase text-muted">
                        {col.replace(/_/g, ' ')}
                      </label>
                      <select
                        className="form-select"
                        value={columnMapping[col] || ''}
                        onChange={(e) => handleMappingChange(col, e.target.value)}
                      >
                        <option value="">Select column...</option>
                        {getColumnOptions().map((option) => (
                          <option key={option} value={option}>
                            {option || '(Not mapped)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}

                  <div className="col-md-6">
                    <label className="form-label fw-semibold small text-uppercase text-muted">Phone (optional)</label>
                    <select
                      className="form-select"
                      value={columnMapping.phone || ''}
                      onChange={(e) => handleMappingChange('phone', e.target.value)}
                    >
                      <option value="">Select column...</option>
                      {getColumnOptions().map((option) => (
                        <option key={option} value={option}>{option || '(Not mapped)'}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-semibold small text-uppercase text-muted">G12 Score (optional)</label>
                    <select
                      className="form-select"
                      value={columnMapping.grade_12_result || ''}
                      onChange={(e) => handleMappingChange('grade_12_result', e.target.value)}
                    >
                      <option value="">Select column...</option>
                      {getColumnOptions().map((option) => (
                        <option key={option} value={option}>{option || '(Not mapped)'}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-semibold small text-uppercase text-muted">COC (optional)</label>
                    <select
                      className="form-select"
                      value={columnMapping.coc_result || ''}
                      onChange={(e) => handleMappingChange('coc_result', e.target.value)}
                    >
                      <option value="">Select column...</option>
                      {getColumnOptions().map((option) => (
                        <option key={option} value={option}>{option || '(Not mapped)'}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-semibold small text-uppercase text-muted">Disability (optional)</label>
                    <select
                      className="form-select"
                      value={columnMapping.disability || ''}
                      onChange={(e) => handleMappingChange('disability', e.target.value)}
                    >
                      <option value="">Select column...</option>
                      {getColumnOptions().map((option) => (
                        <option key={option} value={option}>{option || '(Not mapped)'}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label fw-semibold small text-uppercase text-muted">Minority (optional)</label>
                    <select
                      className="form-select"
                      value={columnMapping.minority || ''}
                      onChange={(e) => handleMappingChange('minority', e.target.value)}
                    >
                      <option value="">Select column...</option>
                      {getColumnOptions().map((option) => (
                        <option key={option} value={option}>{option || '(Not mapped)'}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <h6 className="fw-bold mb-2">Preview (first 5 rows)</h6>
                  <div className="table-responsive rounded-3 overflow-hidden border">
                    <table className="table table-sm table-bordered mb-0 align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>#</th>
                          {Object.keys(preview[0] || {}).map((key) => (
                            <th key={key} style={{ fontSize: '0.82rem' }}>{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, idx) => (
                          <tr key={idx}>
                            <td className="fw-bold">{idx + 1}</td>
                            {Object.values(row).map((val, vidx) => (
                              <td key={vidx} style={{ fontSize: '0.82rem' }}>{val}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="text-center py-5">
                <div className="spinner-border mb-3" role="status" style={{ width: '3rem', height: '3rem', color: '#0d6efd' }}>
                  <span className="visually-hidden">Loading...</span>
                </div>
                <h5 className="fw-bold mb-2">Uploading student records</h5>
                <p className="text-muted mb-0">Please wait while {data.length} records are processed.</p>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <div className="card border-0 text-center" style={{ backgroundColor: '#ecfdf5', borderRadius: '14px' }}>
                      <div className="card-body">
                        <div className="display-6 fw-bold text-success">{results.success}</div>
                        <div className="text-success fw-semibold">Uploaded successfully</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="card border-0 text-center" style={{ backgroundColor: '#fef2f2', borderRadius: '14px' }}>
                      <div className="card-body">
                        <div className="display-6 fw-bold text-danger">{results.failed}</div>
                        <div className="text-danger fw-semibold">Failed uploads</div>
                      </div>
                    </div>
                  </div>
                </div>

                {results.errors.length > 0 && (
                  <div className="alert alert-warning mb-0">
                    <h6 className="fw-bold mb-2">Upload issues</h6>
                    <ul className="mb-0 small">
                      {results.errors.slice(0, 5).map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                      {results.errors.length > 5 && <li>... and {results.errors.length - 5} more</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer border-0 px-4 pb-4 pt-0">
            {step === 1 && (
              <button type="button" className="btn btn-outline-secondary" onClick={handleClose}>
                Cancel
              </button>
            )}

            {step === 2 && (
              <>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setStep(1);
                    setFile(null);
                    setData([]);
                    setPreview([]);
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary px-4"
                  onClick={handleUpload}
                  disabled={loading || Object.values(columnMapping).filter(Boolean).length < 4}
                >
                  Upload {data.length} Students
                </button>
              </>
            )}

            {step === 4 && (
              <button type="button" className="btn btn-primary px-4" onClick={handleClose}>
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkUploadModal;
