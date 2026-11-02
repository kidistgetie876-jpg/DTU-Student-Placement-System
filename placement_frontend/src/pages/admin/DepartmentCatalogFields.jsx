import React, { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import api from '../../services/api.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import {
  DEFAULT_COLLEGES,
  DEFAULT_STREAMS,
  getCollegesForStream,
  mergeColleges,
  mergeStreams,
  normalizeCatalogCollegeName,
  normalizeCatalogStreamName,
} from './departmentCatalog.js';
import './ManageDepartments.css';

const ADD_STREAM = '__add_new_stream__';
const ADD_COLLEGE = '__add_new_college__';

const DepartmentCatalogFields = ({
  streamValue,
  collegeValue,
  onStreamChange,
  onCollegeChange,
  onCatalogsLoaded,
  disabled = false,
  streamContainerClassName = 'col-md-6',
  collegeContainerClassName = 'col-md-6',
  streamLabel = 'Stream',
  collegeLabel = 'College',
  collegeError = '',
  streamSelectClassName = 'form-select',
  collegeSelectClassName = 'form-select',
}) => {
  const { t } = useLanguage();
  const fieldId = useId();
  const streamSelectId = `department-catalog-stream-${fieldId}`;
  const collegeSelectId = `department-catalog-college-${fieldId}`;
  const entryInputId = `department-catalog-entry-name-${fieldId}`;
  const [streams, setStreams] = useState(DEFAULT_STREAMS);
  const [colleges, setColleges] = useState(DEFAULT_COLLEGES);
  const [catalogError, setCatalogError] = useState('');
  const [dialogType, setDialogType] = useState('');
  const [entryName, setEntryName] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);

  useEffect(() => {
    let active = true;
    const loadCatalogs = async () => {
      const [streamsResult, collegesResult] = await Promise.allSettled([
        api.get('api/admin/get_streams.php'),
        api.get('api/common/colleges_api.php'),
      ]);
      const errors = [];
      const readCatalog = (result, key, label) => {
        if (result.status === 'rejected') {
          errors.push(`${label}: ${result.reason?.response?.data?.message || result.reason?.message || 'Unable to load options.'}`);
          return [];
        }
        const payload = result.value.data ?? result.value;
        if (payload?.success === false) {
          errors.push(`${label}: ${payload.message || 'Unable to load options.'}`);
          return [];
        }
        if (Array.isArray(payload?.[key])) return payload[key];
        return Array.isArray(payload) ? payload : [];
      };

      const loadedStreams = readCatalog(streamsResult, 'streams', 'Streams');
      const loadedColleges = readCatalog(collegesResult, 'colleges', 'Colleges');
      const merged = mergeStreams(loadedStreams);
      if (!active) return;
      setStreams(merged);
      setColleges(mergeColleges(loadedColleges, merged));
      setCatalogError(errors.join(' '));
      onCatalogsLoaded?.(merged);
    };

    loadCatalogs();
    return () => { active = false; };
  }, [onCatalogsLoaded]);

  const selectedStream = streams.find(item => (
    String(item.id) === String(streamValue)
    || normalizeCatalogStreamName(item.name).toLowerCase()
      === normalizeCatalogStreamName(streamValue).toLowerCase()
  ));
  const streamColleges = getCollegesForStream(colleges, streams, selectedStream?.name);

  const handleStreamSelect = event => {
    const value = event.target.value;
    if (value === ADD_STREAM) {
      setEntryName('');
      setDialogError('');
      setDialogType('stream');
      return;
    }
    const stream = streams.find(item => (
      String(item.id) === value
      || normalizeCatalogStreamName(item.name).toLowerCase()
        === normalizeCatalogStreamName(value).toLowerCase()
    ));
    onStreamChange(stream?.name || '', stream?.id ?? '');
  };

  const handleCollegeSelect = event => {
    const value = event.target.value;
    if (value === ADD_COLLEGE) {
      setEntryName('');
      setDialogError('');
      setDialogType('college');
      return;
    }
    const college = collegeOptions.find(item => item.name === value);
    onCollegeChange(college?.name || '', college?.id ?? '');
  };

  const closeDialog = () => {
    if (savingEntry) return;
    setDialogType('');
    setDialogError('');
  };

  const handleAddEntry = async event => {
    event?.preventDefault();
    const name = entryName.trim();
    if (!name || name.length > 150) {
      setDialogError(t('Name must be between 1 and 150 characters.'));
      return;
    }

    setSavingEntry(true);
    setDialogError('');
    try {
      if (dialogType === 'stream') {
        const response = await api.post('api/admin/add_stream.php', { name });
        if (!response.data?.success || !response.data?.stream) {
          throw new Error(response.data?.message || 'Unable to add stream.');
        }
        const addedStream = response.data.stream;
        setStreams(current => mergeStreams([...current, addedStream]));
        onStreamChange(addedStream.name, addedStream.id);
      } else {
        const streamId = Number(selectedStream?.id);
        if (!Number.isInteger(streamId) || streamId <= 0) {
          throw new Error('Select a saved stream before adding a college.');
        }
        const response = await api.post('api/admin/add_college.php', { name, stream_id: streamId });
        if (!response.data?.success || !response.data?.college) {
          throw new Error(response.data?.message || 'Unable to add college.');
        }
        const addedCollege = response.data.college;
        setColleges(current => [...current, addedCollege]);
        onCollegeChange(addedCollege.name, addedCollege.id);
      }
      setDialogType('');
    } catch (error) {
      setDialogError(error.response?.data?.message || error.message || 'Unable to save this option.');
    } finally {
      setSavingEntry(false);
    }
  };

  const catalogCollege = streamColleges.find(item => (
    normalizeCatalogCollegeName(item.name, selectedStream?.name).toLowerCase()
      === normalizeCatalogCollegeName(collegeValue, selectedStream?.name).toLowerCase()
  ));
  const selectedCollege = catalogCollege || (collegeValue
    ? { id: '', name: normalizeCatalogCollegeName(collegeValue, selectedStream?.name) }
    : null);
  const collegeOptions = selectedCollege && !catalogCollege
    ? [...streamColleges, selectedCollege]
    : streamColleges;

  return (
    <>
      {catalogError && (
        <div className="col-12">
          <div className="alert alert-danger rounded-3" role="alert">{catalogError}</div>
        </div>
      )}
      <div className={streamContainerClassName}>
        <label className="form-label fw-bold small text-muted" htmlFor={streamSelectId}>{streamLabel}</label>
        <select
          id={streamSelectId}
          className={streamSelectClassName}
          value={selectedStream?.id ?? ''}
          onChange={handleStreamSelect}
          disabled={disabled}
        >
          <option value="">-- {t('Select Stream')} --</option>
          {streams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          <option value={ADD_STREAM}>{t('+ Add New Stream')}</option>
        </select>
      </div>
      <div className={collegeContainerClassName}>
        <label className="form-label fw-bold small text-muted" htmlFor={collegeSelectId}>{collegeLabel}</label>
        <select
          id={collegeSelectId}
          className={collegeSelectClassName}
          value={selectedCollege?.name ?? ''}
          onChange={handleCollegeSelect}
          disabled={disabled || !selectedStream}
          required
        >
          <option value="">-- {t('Select College')} --</option>
          {collegeOptions.map(item => <option key={item.id || item.name} value={item.name}>{item.name}</option>)}
          {selectedStream && <option value={ADD_COLLEGE}>{t('+ Add New College')}</option>}
        </select>
        {collegeError && <div className="invalid-feedback d-block">{collegeError}</div>}
      </div>
      {dialogType && (
        <div className="department-catalog-modal-overlay">
          <div className="department-catalog-modal" role="dialog" aria-modal="true" aria-labelledby="department-catalog-dialog-title">
            <div>
              <div className="department-catalog-modal-header">
                <h2 className="department-catalog-modal-title" id="department-catalog-dialog-title">
                  {dialogType === 'stream' ? t('Add New Stream') : t('Add New College')}
                </h2>
                <button
                  type="button"
                  className="department-catalog-modal-close"
                  aria-label={t('Close')}
                  onClick={closeDialog}
                  disabled={savingEntry}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              <div className="department-catalog-modal-body">
                <label className="department-catalog-modal-label" htmlFor={entryInputId}>
                  {dialogType === 'stream' ? t('Stream name') : t('College name')}
                </label>
                <input
                  id={entryInputId}
                  className="department-catalog-modal-input"
                  value={entryName}
                  onChange={event => setEntryName(event.target.value)}
                  maxLength={150}
                  autoFocus
                  required
                  disabled={savingEntry}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddEntry();
                    }
                  }}
                />
                {dialogError && <div className="department-catalog-modal-error" role="alert">{dialogError}</div>}
              </div>
              <div className="department-catalog-modal-actions">
                <button type="button" className="department-catalog-modal-cancel" onClick={closeDialog} disabled={savingEntry}>
                  {t('Cancel')}
                </button>
                <button type="button" className="department-catalog-modal-submit" onClick={handleAddEntry} disabled={savingEntry}>
                  {savingEntry ? t('Saving...') : t('Add')}
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="department-catalog-modal-backdrop-dismiss"
            aria-label={t('Close catalog dialog')}
            onClick={closeDialog}
            disabled={savingEntry}
          />
        </div>
      )}
    </>
  );
};

export default DepartmentCatalogFields;
