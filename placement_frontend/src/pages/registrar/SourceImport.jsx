import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '../../services/api.js';

const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export const parseSourceImportGrid = (grid, columns) => {
  const requiredHeaders = columns
    .filter(({ required = true, requiredGroup }) => required && !requiredGroup)
    .map(({ header, aliases = [] }) => (
      [header, ...aliases].map(normalizeHeader)
  ));
  const requiredGroups = [...new Set(columns
    .map(({ requiredGroup }) => requiredGroup)
    .filter(Boolean))]
    .map((group) => columns
      .filter(({ requiredGroup }) => requiredGroup === group)
      .flatMap(({ header, aliases = [] }) => [header, ...aliases].map(normalizeHeader)));
  const headerIndex = grid.slice(0, 10).findIndex((row) => {
    const found = new Set(row.map(normalizeHeader));
    return requiredHeaders.every((aliases) => aliases.some((header) => found.has(header)))
      && requiredGroups.every((aliases) => aliases.some((header) => found.has(header)));
  });

  if (headerIndex < 0) return { headersFound: false, rows: [] };

  const headers = grid[headerIndex].map(normalizeHeader);
  const indices = columns.map(({ header, aliases = [] }) => (
    [header, ...aliases]
      .map(normalizeHeader)
      .map((normalizedHeader) => headers.indexOf(normalizedHeader))
      .find((index) => index >= 0) ?? -1
  ));
  const headerRow = grid[headerIndex];
  const expectedColumnCount = headerRow.reduce(
    (lastNonEmptyIndex, cell, index) => String(cell ?? '').trim() !== '' ? index + 1 : lastNonEmptyIndex,
    0,
  );
  const rows = [];
  grid.slice(headerIndex + 1).forEach((row, index) => {
    if (!row.some((cell) => String(cell ?? '').trim() !== '')) return;
    const rowNumber = headerIndex + index + 2;
    if (row.length !== expectedColumnCount) {
      throw new Error(
        `Row ${rowNumber} has ${row.length} columns; the header has ${expectedColumnCount}. Check for missing or extra delimiters.`,
      );
    }
    rows.push(Object.fromEntries(columns.map(({ header }, columnIndex) => [
      header,
      String(indices[columnIndex] >= 0 ? row[indices[columnIndex]] ?? '' : '').trim(),
    ])));
  });

  return { headersFound: true, rows };
};

export const parseSourceImportCsv = (csvText, columns) => {
  const candidates = [',', ';'].map((delimiter) => {
    const workbook = XLSX.read(csvText, { type: 'string', FS: delimiter });
    const sheetName = workbook.SheetNames[0];
    const grid = sheetName
      ? XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: false,
      })
      : [];
    return { delimiter, grid };
  });

  const parsedCandidates = candidates.map(({ delimiter, grid }) => {
    try {
      return { delimiter, grid, parsed: parseSourceImportGrid(grid, columns) };
    } catch (error) {
      return { delimiter, grid, error };
    }
  });
  const matchingCandidate = parsedCandidates.find(({ parsed }) => parsed?.headersFound);
  if (matchingCandidate) return matchingCandidate.parsed;

  const malformedCandidate = parsedCandidates.find(({ error }) => error);
  if (malformedCandidate) throw malformedCandidate.error;
  return { headersFound: false, rows: [] };
};

const SourceImport = ({ title, endpoint, columns, normalizeRows = (sourceRows) => sourceRows, onImportSuccess }) => {
  const fileInputRef = useRef(null);
  const previewColumns = columns.filter(({ showInPreview = true }) => showInPreview);
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
      let parsed;
      if (/\.csv$/i.test(file.name)) {
        parsed = parseSourceImportCsv(
          new TextDecoder().decode(await file.arrayBuffer()),
          columns,
        );
      } else {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('The selected workbook does not contain a worksheet.');
        const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          defval: '',
          raw: false,
        });
        parsed = parseSourceImportGrid(grid, columns);
      }
      if (!parsed.headersFound) {
        throw new Error(`Required columns: ${columns.map(({ header }) => header).join(', ')}.`);
      }
      if (!parsed.rows.length) throw new Error('No data rows were found below the header row.');
      const normalizedRows = normalizeRows(parsed.rows);
      setRows(normalizedRows);
      setStatus({ type: 'info', message: `Preview ready: ${normalizedRows.length} row(s).` });
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
      const responseData = response.data || {};
      const rowErrors = Array.isArray(responseData.row_errors) ? responseData.row_errors : [];
      const rowErrorDetails = rowErrors
        .map(({ row, message }) => `Row ${row}: ${message}`)
        .join(' ');
      const importedCount = Number(
        responseData.imported_count
          ?? responseData.updated_count
          ?? responseData.inserted_count
          ?? responseData.created_count
          ?? 0,
      );
      const updatedCount = Number(responseData.updated_count ?? importedCount);
      const unchangedCount = Number(responseData.unchanged_count ?? 0);
      const hasUpdatedRecords = Number.isFinite(updatedCount) && updatedCount > 0;
      const hasUnchangedRecords = Number.isFinite(unchangedCount) && unchangedCount > 0;
      if (responseData.success !== true && !hasUpdatedRecords && !hasUnchangedRecords) {
        throw new Error([responseData.message, rowErrorDetails].filter(Boolean).join(' '));
      }
      setStatus({
        type: !hasUpdatedRecords && hasUnchangedRecords ? 'info' : 'success',
        message: [
          responseData.message
            || (hasUpdatedRecords
              ? `SIMS import completed: ${updatedCount} record(s) updated.`
              : hasUnchangedRecords
                ? `${unchangedCount} record(s) already exist with no changes.`
                : `Imported ${responseData.imported_count ?? rows.length} row(s).`),
          rowErrorDetails,
        ].filter(Boolean).join(' '),
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
                <tr>{previewColumns.map(({ header }) => <th key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((row, index) => (
                  <tr key={`${row[columns[0].header]}-${index}`}>
                    {previewColumns.map(({ header }) => <td key={header}>{row[header] || '—'}</td>)}
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
