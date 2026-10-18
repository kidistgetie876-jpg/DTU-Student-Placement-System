import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '../../services/api.js';

const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export const parseSourceImportGrid = (grid, columns) => {
  const requiredHeaders = columns.map(({ header, aliases = [] }) => (
    [header, ...aliases].map(normalizeHeader)
  ));
  const headerIndex = grid.slice(0, 10).findIndex((row) => {
    const found = new Set(row.map(normalizeHeader));
    return requiredHeaders.every((aliases) => aliases.some((header) => found.has(header)));
  });

  if (headerIndex < 0) return { headersFound: false, rows: [] };

  const headers = grid[headerIndex].map(normalizeHeader);
  const indices = columns.map(({ header, aliases = [] }) => (
    [header, ...aliases]
      .map(normalizeHeader)
      .map((normalizedHeader) => headers.indexOf(normalizedHeader))
      .find((index) => index >= 0)
  ));
  const rows = grid.slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => Object.fromEntries(columns.map(({ header }, index) => [
      header,
      String(row[indices[index]] ?? '').trim(),
    ])));

  return { headersFound: true, rows };
};

const SourceImport = ({ title, endpoint, columns, onImportSuccess }) => {
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePreview = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setStatus({ type: 'danger', message: 'Choose a SIMS or MoSHE spreadsheet first.' });
      return;
    }

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('The selected workbook does not contain a worksheet.');
      const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: false,
      });
      const parsed = parseSourceImportGrid(grid, columns);
      if (!parsed.headersFound) {
        throw new Error(`Required columns: ${columns.map(({ header }) => header).join(', ')}.`);
      }
      if (!parsed.rows.length) throw new Error('No data rows were found below the header row.');
      setRows(parsed.rows);
      setStatus({ type: 'info', message: `Preview ready: ${parsed.rows.length} row(s).` });
    } catch (error) {
      setRows([]);
      setStatus({ type: 'danger', message: error.message || 'Unable to read this spreadsheet.' });
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    setStatus(null);
    try {
      const response = await api.post(endpoint, { students: rows });
      if (response.data?.success !== true) {
        throw new Error(response.data?.message || 'Import failed.');
      }
      setStatus({
        type: 'success',
        message: response.data.message || `Imported ${response.data.imported_count ?? rows.length} row(s).`,
      });
      setRows([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onImportSuccess?.();
    } catch (error) {
      setStatus({
        type: 'danger',
        message: error.response?.data?.message || error.message || 'Import request failed.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card shadow-sm border-0 rounded-4 mb-4">
      <div className="card-body p-4">
        <h4 className="fw-bold text-primary mb-2">{title}</h4>
        <p className="text-muted small">
          Upload an Excel or CSV file with the required official column names. Verify the preview before importing.
        </p>
        {status && (
          <div className={`alert alert-${status.type}`} role={status.type === 'danger' ? 'alert' : 'status'}>
            {status.message}
          </div>
        )}
        <div className="d-flex gap-2 flex-wrap mb-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            className="form-control"
            onChange={() => {
              setRows([]);
              setStatus(null);
            }}
          />
          <button type="button" className="btn btn-outline-primary" onClick={handlePreview}>Preview file</button>
          <button type="button" className="btn btn-primary" onClick={handleImport} disabled={!rows.length || loading}>
            {loading ? 'Importing…' : `Import ${rows.length || ''} rows`}
          </button>
        </div>
        {rows.length > 0 && (
          <div className="table-responsive">
            <table className="table table-sm table-striped align-middle">
              <thead>
                <tr>{columns.map(({ header }) => <th key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((row, index) => (
                  <tr key={`${row[columns[0].header]}-${index}`}>
                    {columns.map(({ header }) => <td key={header}>{row[header] || '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && <p className="small text-muted mb-0">Showing the first 10 of {rows.length} rows.</p>}
          </div>
        )}
      </div>
    </section>
  );
};

export default SourceImport;
