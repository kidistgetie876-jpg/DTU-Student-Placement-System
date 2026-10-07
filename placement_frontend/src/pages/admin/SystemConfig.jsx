import React, { useEffect, useRef, useState } from 'react';
import {
  FiCalendar,
  FiChevronRight,
  FiGlobe,
  FiHome,
  FiMapPin,
  FiSave,
  FiTool,
  FiX,
} from 'react-icons/fi';
import api from '../../services/api.js';

const defaultSettings = {
  site: {
    universityTitle: 'DEBRE TABOR UNIVERSITY',
    systemSubtitle: 'Student Department Placement System',
  },
  contact: {
    location: 'Registrar Office, Ground Floor, Main Campus, Debre Tabor, Ethiopia',
    phone1: '+251 988024266',
    phone2: '+251 995015403',
    supportEmail: 'tsegayaaderajew021@gmail.com',
    officeHours: 'Monday - Friday: 8:30 AM - 5:30 PM (Local Time)',
  },
  maintenance: {
    enabled: false,
    title: 'System Under Maintenance',
    message: 'The DTU Placement Portal is currently undergoing scheduled system updates. Services will resume shortly.',
    expectedReturn: 'Soon',
  },
  placement: {
    submissionStart: '2026-08-01',
    submissionDeadline: '2026-08-15',
    processingStart: '2026-08-16',
    processingEnd: '2026-08-24',
    resultsDate: '2026-08-27',
    appealStart: '2026-08-27',
    appealEnd: '2026-08-30',
    gpa_weight: 40,
    grade_12_weight: 20,
    coc_weight: 30,
    gender_weight: 3,
    disability_weight: 3,
    minority_weight: 4,
    guideTitle: 'Placement Information & Student Guide',
    guideDescription: 'This guide explains the university placement process, criteria, login steps, department capacity rules, and result timelines for students at Debre Tabor University.',
    rulesTabLabel: 'Rules & Criteria',
    capacityTabLabel: 'Capacity Overview',
    loginTabLabel: 'Login Guide',
    preferencesTabLabel: 'Rank Preferences',
    resultsTabLabel: 'Results & Appeal',
    scheduleTabLabel: 'Schedule',
    rulesTitle: 'Placement Rules & Criteria',
    rulesSummary: 'The university uses a transparent and fair merit-based placing process to assign students to departments based on academic performance and approved support points.',
    rulesIntroduction: 'Every student is evaluated using a weighted placement formula that reflects academic achievement and eligible support considerations.',
    genderEquityTitle: 'Gender Equity',
    genderEquityText: 'Female students may receive affirmative action points as approved by the university.',
    disabilitySupportTitle: 'Disability Support',
    disabilitySupportText: 'Students with documented disability status may be granted additional points under the placement policy.',
    minoritySupportTitle: 'Minority / Emerging Region',
    minoritySupportText: 'Eligible minority and emerging-region students may receive additional points as part of the affirmative action guideline.',
    capacityTitle: 'Department Capacity Overview',
    capacitySummary: 'Each department has a fixed number of available seats determined by the university council and academic leadership.',
    capacityDescription: 'Capacity is limited and may vary by department, stream, and academic year. Students are ranked according to their placement score and department preferences.',
    capacityGroup1: 'Natural Science',
    capacityGroup2: 'Social Science',
    capacityGroup3: 'Health Sciences',
    capacityGroup4: 'Technology & Engineering',
    capacityGroup5: 'Business & Economics',
    capacityGroup1Description: 'Departments in this category operate with fixed quota limits, and seats are allocated based on merit ranking and preference order.',
    capacityGroup2Description: 'Departments in this category operate with fixed quota limits, and seats are allocated based on merit ranking and preference order.',
    capacityGroup3Description: 'Departments in this category operate with fixed quota limits, and seats are allocated based on merit ranking and preference order.',
    capacityGroup4Description: 'Departments in this category operate with fixed quota limits, and seats are allocated based on merit ranking and preference order.',
    capacityGroup5Description: 'Departments in this category operate with fixed quota limits, and seats are allocated based on merit ranking and preference order.',
    loginTitle: 'Login & Account Guide',
    loginSummary: 'Students access the system through their assigned portal credentials provided by the Registrar’s Office.',
    loginStep1: 'Open the Student Portal and go to the login screen.',
    loginStep2: 'Use your registered username or student ID exactly as assigned by the Registrar.',
    loginStep3: 'Enter the password issued with your account credentials.',
    loginStep4: 'Access your dashboard to review placement information, select preferences, and view departmental assignments.',
    loginStep5: 'Contact the Registrar immediately if you forget your login details or your account is not working.',
    preferencesTitle: 'How to Select & Rank Preferences',
    preferencesSummary: 'Students must select their stream, then college, and finally rank departments according to preference, with no second submission opportunity after finalizing.',
    preferenceStep1: 'Choose your stream from the available academic options.',
    preferenceStep2: 'Select the college associated with your chosen stream.',
    preferenceStep3: 'Pick and rank your preferred departments from the list shown.',
    preferenceStep4: 'Submit your final ranking once and confirm before the deadline closes.',
    preferencesImportantNote: 'Preference submission is one-time only. Review carefully before submitting your list.',
    resultsTitle: 'How to View Results & Appeal',
    resultsSummary: 'Once placement processing is complete, students can review their merit score and assigned department in the portal.',
    viewResultsTitle: 'View Placement Results',
    viewResultsText: 'Log in to your dashboard and check your merit score, rank, and final department placement. This helps you understand the result before taking any further action.',
    submitAppealTitle: 'Submit an Appeal',
    submitAppealText: 'If you believe there is an error in the placement calculation, missing data, or institutional processing issue, submit an appeal within the official appeal window.',
    scheduleTitle: 'Placement Schedule & Deadlines',
    scheduleSummary: 'The university follows a structured timeline to allow enough time for student decision-making, processing, and review.',
  },
  homepage: {
    academicYear: '2016 E.C. / 2026 G.C. Placement Cycle',
    footerCopyrightText: 'DTU Placement. All rights reserved.',
    footerText: 'Connecting students, departments, and employers through a transparent and efficient placement experience.',
    heroTitle: 'Debre Tabor University Student Department Placement System',
    heroText: 'A modern and trusted platform for departments, students, and placement offices to manage academic placement services with confidence.',
    heroPrimaryButton: 'View Placement Services',
    heroSecondaryButton: 'Contact Office',
    directoryEyebrow: 'Academic Excellence',
    directoryTitle: 'DEBRE TABOR UNIVERSITY - COLLEGES & DEPARTMENTS',
    directorySubtitle: 'Debre Tabor University is organized into diverse colleges and schools that serve students through strong academic programs, applied research, and practical professional training across science, technology, health, business, and the humanities.',
    statsHeading: 'Why DTU students choose this portal',
    statsDescription: 'This platform is designed to support departments in managing placement requests, tracking student progress, and connecting applicants with the right opportunities.',
    stat1Number: '120+',
    stat1Label: 'Placement records',
    stat2Number: '24/7',
    stat2Label: 'Support access',
    stat3Number: '95%',
    stat3Label: 'Readiness rate',
    feature1Title: 'Academic Placement',
    feature1Desc: 'Support students across faculties with department-based placement coordination.',
    feature2Title: 'Career Readiness',
    feature2Desc: 'Prepare graduates for internships, employment, and professional growth.',
    feature3Title: 'Student Support',
    feature3Desc: 'Connect learners with advisors, employers, and university placement offices.',
    coreServicesTitle: 'Core Services',
    coreService1: 'Department placement tracking',
    coreService2: 'Internship and job coordination',
    coreService3: 'Student advisory support',
  },
  navigation: [
    { id: 'home', label: 'Home', path: '/', enabled: true },
    { id: 'services', label: 'Services', path: '/services', enabled: true },
    { id: 'placement-info', label: 'Placement Info', path: '/placement-info', enabled: true },
    { id: 'announcements', label: 'Announcements', path: '/announcements', enabled: true },
    { id: 'contact', label: 'Contact', path: '/contact', enabled: true },
  ],
};

const settingCards = [
  { id: 'contact', title: 'Contact Page Settings', description: 'Manage campus, phone, and support details.', icon: FiMapPin },
  { id: 'placement', title: 'Placement Dates & Deadlines', description: 'Set submission, processing, results, and appeal dates.', icon: FiCalendar },
  { id: 'navigation', title: 'Homepage & Navigation Settings', description: 'Customize portal titles and public links.', icon: FiGlobe },
  { id: 'homepage', title: 'Homepage Content Management', description: 'Manage all homepage headings, descriptions, buttons, statistics, and featured content.', icon: FiHome },
  { id: 'maintenance', title: 'System Maintenance & Status', description: 'Temporarily close the portal and manage the public maintenance notice.', icon: FiTool },
];

const placementWeightFields = [
  ['gpa_weight', 'GPA Weight (%)'],
  ['grade_12_weight', 'Grade 12 Weight (%)'],
  ['coc_weight', 'COC Weight (%)'],
  ['gender_weight', 'Gender Affirmative Action Weight (%)'],
  ['disability_weight', 'Disability Affirmative Action Weight (%)'],
  ['minority_weight', 'Minority Affirmative Action Weight (%)'],
];

const placementGuideFields = [
  ['guideTitle', 'Guide Page Title', 1],
  ['guideDescription', 'Guide Page Description', 3],
  ['rulesTabLabel', 'Rules Tab Label', 1],
  ['rulesTitle', 'Rules Section Title', 1],
  ['rulesSummary', 'Rules Summary', 3],
  ['rulesIntroduction', 'Rules Introduction', 3],
  ['genderEquityTitle', 'Gender Equity Heading', 1],
  ['genderEquityText', 'Gender Equity Description', 2],
  ['disabilitySupportTitle', 'Disability Support Heading', 1],
  ['disabilitySupportText', 'Disability Support Description', 2],
  ['minoritySupportTitle', 'Minority Support Heading', 1],
  ['minoritySupportText', 'Minority Support Description', 2],
  ['capacityTabLabel', 'Capacity Tab Label', 1],
  ['capacityTitle', 'Capacity Section Title', 1],
  ['capacitySummary', 'Capacity Summary', 3],
  ['capacityDescription', 'Capacity Description', 3],
  ['capacityGroup1', 'Capacity Group 1', 1],
  ['capacityGroup2', 'Capacity Group 2', 1],
  ['capacityGroup3', 'Capacity Group 3', 1],
  ['capacityGroup4', 'Capacity Group 4', 1],
  ['capacityGroup5', 'Capacity Group 5', 1],
  ['capacityGroup1Description', 'Capacity Group 1 Description', 2],
  ['capacityGroup2Description', 'Capacity Group 2 Description', 2],
  ['capacityGroup3Description', 'Capacity Group 3 Description', 2],
  ['capacityGroup4Description', 'Capacity Group 4 Description', 2],
  ['capacityGroup5Description', 'Capacity Group 5 Description', 2],
  ['loginTabLabel', 'Login Tab Label', 1],
  ['loginTitle', 'Login Section Title', 1],
  ['loginSummary', 'Login Summary', 3],
  ['loginStep1', 'Login Guide Step 1', 2],
  ['loginStep2', 'Login Guide Step 2', 2],
  ['loginStep3', 'Login Guide Step 3', 2],
  ['loginStep4', 'Login Guide Step 4', 2],
  ['loginStep5', 'Login Guide Step 5', 2],
  ['preferencesTabLabel', 'Preferences Tab Label', 1],
  ['preferencesTitle', 'Preferences Section Title', 1],
  ['preferencesSummary', 'Preferences Summary', 3],
  ['preferenceStep1', 'Preference Guide Step 1', 2],
  ['preferenceStep2', 'Preference Guide Step 2', 2],
  ['preferenceStep3', 'Preference Guide Step 3', 2],
  ['preferenceStep4', 'Preference Guide Step 4', 2],
  ['preferencesImportantNote', 'Preferences Important Note', 2],
  ['resultsTabLabel', 'Results Tab Label', 1],
  ['resultsTitle', 'Results Section Title', 1],
  ['resultsSummary', 'Results Summary', 3],
  ['viewResultsTitle', 'View Results Heading', 1],
  ['viewResultsText', 'View Results Description', 3],
  ['submitAppealTitle', 'Appeal Heading', 1],
  ['submitAppealText', 'Appeal Description', 3],
  ['scheduleTabLabel', 'Schedule Tab Label', 1],
  ['scheduleTitle', 'Schedule Section Title', 1],
  ['scheduleSummary', 'Schedule Summary', 3],
];

const mergeSettings = (value) => ({
  ...defaultSettings,
  ...(value || {}),
  site: { ...defaultSettings.site, ...(value?.site || {}) },
  contact: { ...defaultSettings.contact, ...(value?.contact || {}) },
  maintenance: { ...defaultSettings.maintenance, ...(value?.maintenance || {}) },
  placement: { ...defaultSettings.placement, ...(value?.placement || {}) },
  homepage: { ...defaultSettings.homepage, ...(value?.homepage || {}) },
  navigation: defaultSettings.navigation.map((defaultLink) => {
    const savedLink = Array.isArray(value?.navigation)
      ? value.navigation.find((link) => link.id === defaultLink.id)
      : null;
    return { ...defaultLink, ...(savedLink || {}) };
  }),
});

const normalizeHomepageSettings = (value) => {
  let homepage = value?.public_portal || value?.homepage || value || {};
  if (typeof homepage === 'string') {
    try {
      homepage = JSON.parse(homepage);
    } catch {
      homepage = {};
    }
  }

  return {
    ...defaultSettings.homepage,
    ...(homepage && typeof homepage === 'object' ? homepage : {}),
    academicYear: homepage?.academicYear || homepage?.heroBadge || defaultSettings.homepage.academicYear,
    heroText: homepage?.heroText || homepage?.heroDescription || defaultSettings.homepage.heroText,
  };
};

const normalizeBoolean = (value) => value === true || value === 1 || ['true', '1', 'yes'].includes(String(value).toLowerCase());

const SystemConfig = () => {
  const [settings, setSettings] = useState(defaultSettings);
  const [maintenanceForm, setMaintenanceForm] = useState(defaultSettings.maintenance);
  const [activeEditor, setActiveEditor] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const editorCloseTimeout = useRef(null);

  const fetchSettings = async () => {
    const response = await api.get('api/common/system_settings_api.php');
    const savedSettings = response.data?.settings || response.data?.data?.settings || response.data?.data || {};
    const homepage = normalizeHomepageSettings(savedSettings);
    setSettings(mergeSettings({ ...savedSettings, homepage }));
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        await fetchSettings();
      } catch (loadError) {
        setError(loadError.response?.data?.message || 'Settings could not be loaded from the server.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!activeEditor) return undefined;

    let isCurrent = true;
    const loadEditorSettings = async () => {
      setSaveError('');
      try {
        const response = await api.get('api/common/system_settings_api.php');
        if (!isCurrent) return;
        const savedSettings = response.data?.settings || response.data?.data?.settings || response.data?.data || {};
        const homepage = normalizeHomepageSettings(savedSettings);
        const savedMaintenance = savedSettings.maintenance || {};
        let registrarWeights = {};
        if (activeEditor === 'placement') {
          try {
            const rulesResponse = await api.get('api/registrar/get_placement_settings.php');
            const rules = rulesResponse.data?.settings || rulesResponse.data?.data || rulesResponse.data || {};
            registrarWeights = Object.fromEntries(
              placementWeightFields
                .map(([key]) => [key, rules[key]])
                .filter(([, value]) => value !== undefined && value !== null)
            );
          } catch {
          }
        }
        if (!isCurrent) return;
        setSettings((current) => mergeSettings({
          ...current,
          ...savedSettings,
          homepage,
          placement: { ...current.placement, ...savedSettings.placement, ...registrarWeights },
        }));
        if (activeEditor === 'maintenance') {
          setMaintenanceForm({
            ...defaultSettings.maintenance,
            ...savedMaintenance,
            enabled: normalizeBoolean(savedMaintenance.enabled),
          });
        }
      } catch (loadError) {
        if (isCurrent) {
          setSaveError(loadError.response?.data?.message || 'Settings could not be loaded.');
        }
      }
    };

    loadEditorSettings();
    return () => {
      isCurrent = false;
    };
  }, [activeEditor]);

  useEffect(() => () => {
    if (editorCloseTimeout.current) {
      window.clearTimeout(editorCloseTimeout.current);
    }
  }, []);

  const updateSetting = (section, key, value) => {
    setSettings((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    setSaveSuccess('');
    setSaveError('');
    try {
      const placementFormState = settings.placement;
      const payload = activeEditor === 'placement'
        ? { settings: { placement: placementFormState } }
        : { settings };
      const response = await api.post('api/common/system_settings_api.php', payload);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save settings.');
      }
      if (activeEditor === 'placement') {
        const placement = placementFormState;
        const rulesResponse = await api.post('api/registrar/update_placement_settings.php', {
          gpa_weight: Number(placement.gpa_weight),
          grade_12_weight: Number(placement.grade_12_weight),
          coc_weight: Number(placement.coc_weight),
          gender_weight: Number(placement.gender_weight),
          disability_weight: Number(placement.disability_weight),
          minority_weight: Number(placement.minority_weight),
        });
        if (!rulesResponse.data?.success) {
          throw new Error(rulesResponse.data?.message || 'Unable to save placement scoring weights.');
        }
      }
      setSettings(mergeSettings(response.data?.settings || settings));
      setSaveSuccess(activeEditor === 'placement' ? '✓ Placement timeline and weights successfully saved!' : 'Settings saved successfully.');
      window.dispatchEvent(new Event('system-settings-updated'));
      if (editorCloseTimeout.current) window.clearTimeout(editorCloseTimeout.current);
      editorCloseTimeout.current = window.setTimeout(() => {
        closeEditor();
        editorCloseTimeout.current = null;
      }, 1200);
    } catch (saveError) {
      setSaveError(saveError.response?.data?.message || saveError.message || 'Unable to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveMaintenanceSettings = async () => {
    setSaving(true);
    setSaveSuccess('');
    setSaveError('');
    try {
      const formState = { ...maintenanceForm, enabled: Boolean(maintenanceForm.enabled) };
      const response = await api.post('api/common/system_settings_api.php', {
        settings: { maintenance: formState },
      });
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save maintenance status.');
      }

      const savedMaintenance = response.data?.settings?.maintenance || formState;
      setMaintenanceForm({
        ...defaultSettings.maintenance,
        ...savedMaintenance,
        enabled: normalizeBoolean(savedMaintenance.enabled),
      });
      setSettings((current) => mergeSettings({
        ...current,
        ...(response.data?.settings || {}),
        maintenance: savedMaintenance,
      }));
      setSaveSuccess('✓ Maintenance status successfully saved!');
      window.dispatchEvent(new Event('system-settings-updated'));
      if (editorCloseTimeout.current) window.clearTimeout(editorCloseTimeout.current);
      editorCloseTimeout.current = window.setTimeout(() => {
        closeEditor();
        editorCloseTimeout.current = null;
      }, 1200);
    } catch (saveError) {
      setSaveError(saveError.response?.data?.message || saveError.message || 'Unable to save maintenance status. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveHomepageSettings = async () => {
    setSaving(true);
    setSaveSuccess('');
    setSaveError('');
    setMessage('');
    setError('');

    try {
      const formState = settings.homepage;
      const response = await api.post('api/common/system_settings_api.php', formState);
      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Unable to save homepage settings.');
      }

      setSettings((current) => ({
        ...current,
        homepage: normalizeHomepageSettings(response.data?.data || formState),
      }));
      setSaveSuccess('Settings saved successfully.');
      window.dispatchEvent(new Event('system-settings-updated'));
      if (editorCloseTimeout.current) window.clearTimeout(editorCloseTimeout.current);
      editorCloseTimeout.current = window.setTimeout(() => {
        closeEditor();
        editorCloseTimeout.current = null;
      }, 1200);
    } catch (saveError) {
      setSaveError(saveError.response?.data?.message || saveError.message || 'Unable to save homepage settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const closeEditor = () => {
    if (editorCloseTimeout.current) {
      window.clearTimeout(editorCloseTimeout.current);
      editorCloseTimeout.current = null;
    }
    setActiveEditor('');
    setError('');
    setMessage('');
    setSaveError('');
    setSaveSuccess('');
  };

  const activeCard = settingCards.find((card) => card.id === activeEditor);

  return (
    <section aria-labelledby="system-settings-heading">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-3 mb-4">
        <div>
          <p className="text-uppercase small fw-semibold text-primary mb-2">Portal administration</p>
          <h2 id="system-settings-heading" className="h3 fw-bold mb-1">System Settings &amp; Content Management</h2>
          <p className="text-muted mb-0">Manage public information and placement communications.</p>
        </div>
        {loading && <span className="small text-muted">Loading settings...</span>}
      </div>

      {message && <div className="alert alert-success py-2" role="status">{message}</div>}
      {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}

      <div className="row g-3">
        {settingCards.map(({ id, title, description, icon: Icon }) => (
          <div className="col-sm-6 col-xl-3" key={id}>
            <button
              type="button"
              className="card h-100 w-100 text-start border shadow-sm p-0"
              onClick={() => { setActiveEditor(id); setSaveSuccess(''); setSaveError(''); setError(''); }}
              aria-label={`Open ${title}`}
            >
              <span className="card-body d-flex flex-column align-items-start">
                <span className="d-inline-flex align-items-center justify-content-center rounded bg-primary-subtle text-primary p-3 mb-3">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <span className="fw-bold text-dark mb-2">{title}</span>
                <span className="small text-muted mb-3">{description}</span>
                <span className="small text-primary d-inline-flex align-items-center gap-2 mt-auto">Manage <FiChevronRight aria-hidden="true" /></span>
              </span>
            </button>
          </div>
        ))}
      </div>

      {activeEditor && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3" style={{ zIndex: 1050, background: 'rgba(12, 24, 38, 0.55)' }}>
          <section
            className="bg-white shadow-lg w-100"
            style={{ maxWidth: '960px', maxHeight: '92vh', overflowY: 'auto', borderRadius: '8px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-editor-title"
          >
            <header className="d-flex justify-content-between align-items-start gap-3 p-4 border-bottom">
              <div>
                <h3 id="settings-editor-title" className="h5 fw-bold mb-1">{activeCard?.title}</h3>
                <p className="small text-muted mb-0">Changes are saved to the public portal.</p>
              </div>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={closeEditor} aria-label="Close settings editor">
                <FiX aria-hidden="true" />
              </button>
            </header>

            <div className="p-4">
              {activeEditor === 'contact' && (
                <form onSubmit={(event) => { event.preventDefault(); saveSettings(); }}>
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label" htmlFor="contact-location">Main Campus Location</label>
                      <input id="contact-location" className="form-control" value={settings.contact.location} onChange={(event) => updateSetting('contact', 'location', event.target.value)} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="contact-phone-one">Phone Number 1</label>
                      <input id="contact-phone-one" className="form-control" value={settings.contact.phone1} onChange={(event) => updateSetting('contact', 'phone1', event.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="contact-phone-two">Phone Number 2</label>
                      <input id="contact-phone-two" className="form-control" value={settings.contact.phone2} onChange={(event) => updateSetting('contact', 'phone2', event.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="contact-support-email">Support Email</label>
                      <input id="contact-support-email" type="email" className="form-control" value={settings.contact.supportEmail} onChange={(event) => updateSetting('contact', 'supportEmail', event.target.value)} required />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="contact-office-hours">Office Hours</label>
                      <input id="contact-office-hours" className="form-control" value={settings.contact.officeHours} onChange={(event) => updateSetting('contact', 'officeHours', event.target.value)} placeholder="e.g. Monday - Friday: 8:30 AM - 5:30 PM (Local Time)" />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary mt-4" disabled={saving}><FiSave className="me-2" />{saving ? 'Saving...' : 'Save Contact Info'}</button>
                  {saveSuccess && <div className="alert alert-success mt-3 mb-0" role="status">{saveSuccess}</div>}
                  {saveError && <div className="alert alert-danger mt-3 mb-0" role="alert">{saveError}</div>}
                </form>
              )}

              {activeEditor === 'maintenance' && (
                <form onSubmit={(event) => { event.preventDefault(); saveMaintenanceSettings(); }}>
                  <div className="d-flex align-items-center justify-content-between gap-3 p-3 mb-4 border rounded">
                    <div>
                      <div className="form-label fw-bold mb-1">Maintenance Mode</div>
                      <div className="small text-muted">When enabled, public and non-admin portal pages are locked.</div>
                    </div>
                    <div className="d-flex align-items-center gap-3">
                      <button
                        type="button"
                        className={`btn fw-bold px-3 py-1 rounded-pill shadow-sm transition-all ${maintenanceForm.enabled ? 'btn-danger' : 'btn-outline-success'}`}
                        style={{ minWidth: '90px', cursor: 'pointer' }}
                        aria-pressed={maintenanceForm.enabled}
                        onClick={() => setMaintenanceForm((previous) => ({ ...previous, enabled: !previous.enabled }))}
                        disabled={saving}
                      >
                        {maintenanceForm.enabled ? '🔴 ON' : '🟢 OFF'}
                      </button>
                      <span className="small text-muted">
                        {maintenanceForm.enabled
                          ? 'Portal will be LOCKED to non-admins upon saving.'
                          : 'Portal is active and open to everyone.'}
                      </span>
                    </div>
                  </div>
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label" htmlFor="maintenance-title">Maintenance Notice Title</label>
                      <input
                        id="maintenance-title"
                        className="form-control"
                        value={maintenanceForm.title}
                        onChange={(event) => setMaintenanceForm((previous) => ({ ...previous, title: event.target.value }))}
                        maxLength="180"
                        disabled={saving}
                        required
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="maintenance-message">Custom Message for Public/Students</label>
                      <textarea
                        id="maintenance-message"
                        className="form-control"
                        rows="4"
                        value={maintenanceForm.message}
                        onChange={(event) => setMaintenanceForm((previous) => ({ ...previous, message: event.target.value }))}
                        maxLength="2000"
                        disabled={saving}
                        required
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="maintenance-return">Expected Resumption Time (Optional)</label>
                      <input
                        id="maintenance-return"
                        className="form-control"
                        value={maintenanceForm.expectedReturn}
                        onChange={(event) => setMaintenanceForm((previous) => ({ ...previous, expectedReturn: event.target.value }))}
                        maxLength="120"
                        placeholder="e.g. Estimated Return: 2:00 PM"
                        disabled={saving}
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary mt-4" disabled={saving}>
                    <FiSave className="me-2" aria-hidden="true" />
                    {saving ? 'Saving...' : 'Save Maintenance Status'}
                  </button>
                  {saveSuccess && <div className="alert alert-success mt-3 mb-0" role="status">{saveSuccess}</div>}
                  {saveError && <div className="alert alert-danger mt-3 mb-0" role="alert">{saveError}</div>}
                </form>
              )}

              {activeEditor === 'placement' && (
                <form onSubmit={(event) => { event.preventDefault(); saveSettings(); }}>
                  <div className="row g-3">
                    {[
                      ['submissionStart', 'Submission Start'],
                      ['submissionDeadline', 'Submission Deadline'],
                      ['processingStart', 'Processing Start'],
                      ['processingEnd', 'Processing End'],
                      ['resultsDate', 'Results Announcement Date'],
                      ['appealStart', 'Appeal Window Start'],
                      ['appealEnd', 'Appeal Window End'],
                    ].map(([key, label]) => (
                      <div className="col-md-6 col-lg-4" key={key}>
                        <label className="form-label" htmlFor={`placement-${key}`}>{label}</label>
                        <input id={`placement-${key}`} type="date" className="form-control" value={settings.placement[key]} onChange={(event) => updateSetting('placement', key, event.target.value)} />
                      </div>
                    ))}
                    <div className="col-12 mt-4">
                      <h4 className="h6 fw-bold mb-0">Placement Scoring Weights</h4>
                    </div>
                    {placementWeightFields.map(([key, label]) => (
                      <div className="col-md-6" key={key}>
                        <label className="form-label" htmlFor={`placement-${key}`}>{label}</label>
                        <input id={`placement-${key}`} type="number" min="0" max="100" step="any" className="form-control" value={settings.placement[key]} onChange={(event) => updateSetting('placement', key, event.target.value)} required />
                      </div>
                    ))}
                    <div className="col-12 mt-4">
                      <h4 className="h6 fw-bold mb-0">Placement Guide Content</h4>
                    </div>
                    {placementGuideFields.map(([key, label, rows]) => (
                      <div className={rows === 1 ? 'col-md-6' : 'col-12'} key={key}>
                        <label className="form-label" htmlFor={`placement-${key}`}>{label}</label>
                        {rows === 1 ? (
                          <input id={`placement-${key}`} className="form-control" value={settings.placement[key]} onChange={(event) => updateSetting('placement', key, event.target.value)} />
                        ) : (
                          <textarea id={`placement-${key}`} className="form-control" rows={rows} value={settings.placement[key]} onChange={(event) => updateSetting('placement', key, event.target.value)} />
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="submit" className="btn btn-primary mt-4" disabled={saving}><FiSave className="me-2" />{saving ? 'Saving...' : 'Save Placement Timeline'}</button>
                  {saveSuccess && <div className="alert alert-success mt-3 mb-0" role="status">{saveSuccess}</div>}
                  {saveError && <div className="alert alert-danger mt-3 mb-0" role="alert">{saveError}</div>}
                </form>
              )}

              {activeEditor === 'navigation' && (
                <form onSubmit={(event) => { event.preventDefault(); saveSettings(); }}>
                  <div className="row g-3 mb-4">
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="site-university-title">University Title</label>
                      <input id="site-university-title" className="form-control" value={settings.site.universityTitle} onChange={(event) => updateSetting('site', 'universityTitle', event.target.value)} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="site-system-subtitle">Portal Title</label>
                      <input id="site-system-subtitle" className="form-control" value={settings.site.systemSubtitle} onChange={(event) => updateSetting('site', 'systemSubtitle', event.target.value)} required />
                    </div>
                  </div>
                  <h4 className="h6 fw-bold mb-3">Public navigation links</h4>
                  <div className="border rounded">
                    {settings.navigation.map((link, index) => (
                      <div className={`row align-items-center g-2 p-3 ${index ? 'border-top' : ''}`} key={link.id}>
                        <div className="col-sm-3">
                          <div className="small fw-semibold">{link.path}</div>
                        </div>
                        <div className="col-sm">
                          <label className="visually-hidden" htmlFor={`navigation-label-${link.id}`}>{link.id} link label</label>
                          <input id={`navigation-label-${link.id}`} className="form-control form-control-sm" value={link.label} onChange={(event) => setSettings((current) => ({ ...current, navigation: current.navigation.map((entry) => entry.id === link.id ? { ...entry, label: event.target.value } : entry) }))} aria-label={`${link.id} navigation label`} />
                        </div>
                        <div className="col-auto">
                          <div className="form-check form-switch mb-0">
                            <input id={`navigation-enabled-${link.id}`} className="form-check-input" type="checkbox" checked={link.enabled} onChange={(event) => setSettings((current) => ({ ...current, navigation: current.navigation.map((entry) => entry.id === link.id ? { ...entry, enabled: event.target.checked } : entry) }))} />
                            <label className="form-check-label small" htmlFor={`navigation-enabled-${link.id}`}>Show</label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="submit" className="btn btn-primary mt-4" disabled={saving}><FiSave className="me-2" />{saving ? 'Saving...' : 'Save Homepage & Navigation'}</button>
                  {saveSuccess && <div className="alert alert-success mt-3 mb-0" role="status">{saveSuccess}</div>}
                  {saveError && <div className="alert alert-danger mt-3 mb-0" role="alert">{saveError}</div>}
                </form>
              )}

              {activeEditor === 'homepage' && (
                <form onSubmit={(event) => { event.preventDefault(); saveHomepageSettings(); }}>
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label" htmlFor="homepage-academic-year">Academic Year / Batch Title</label>
                      <input id="homepage-academic-year" className="form-control" value={settings.homepage.academicYear} onChange={(event) => updateSetting('homepage', 'academicYear', event.target.value)} placeholder="2016 E.C. / 2026 G.C. Placement Cycle" required />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="homepage-footer-copyright-text">Footer Copyright Text</label>
                      <input id="homepage-footer-copyright-text" className="form-control" value={settings.homepage.footerCopyrightText} onChange={(event) => updateSetting('homepage', 'footerCopyrightText', event.target.value)} placeholder="DTU Placement. All rights reserved." />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="homepage-hero-title">Hero Banner Main Title</label>
                      <textarea id="homepage-hero-title" className="form-control" rows="2" value={settings.homepage.heroTitle} onChange={(event) => updateSetting('homepage', 'heroTitle', event.target.value)} required />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="homepage-hero-description">Hero Subtitle / Description</label>
                      <textarea id="homepage-hero-description" className="form-control" rows="3" value={settings.homepage.heroText} onChange={(event) => updateSetting('homepage', 'heroText', event.target.value)} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="homepage-hero-primary-button">Hero Primary Button</label>
                      <input id="homepage-hero-primary-button" className="form-control" value={settings.homepage.heroPrimaryButton} onChange={(event) => updateSetting('homepage', 'heroPrimaryButton', event.target.value)} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="homepage-hero-secondary-button">Hero Secondary Button</label>
                      <input id="homepage-hero-secondary-button" className="form-control" value={settings.homepage.heroSecondaryButton} onChange={(event) => updateSetting('homepage', 'heroSecondaryButton', event.target.value)} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="homepage-directory-eyebrow">Colleges Directory Eyebrow</label>
                      <input id="homepage-directory-eyebrow" className="form-control" value={settings.homepage.directoryEyebrow} onChange={(event) => updateSetting('homepage', 'directoryEyebrow', event.target.value)} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="homepage-directory-title">Colleges Directory Title</label>
                      <input id="homepage-directory-title" className="form-control" value={settings.homepage.directoryTitle} onChange={(event) => updateSetting('homepage', 'directoryTitle', event.target.value)} required />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="homepage-directory-subtitle">Colleges Directory Subtitle</label>
                      <textarea id="homepage-directory-subtitle" className="form-control" rows="3" value={settings.homepage.directorySubtitle} onChange={(event) => updateSetting('homepage', 'directorySubtitle', event.target.value)} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="homepage-stats-heading">Statistics Section Heading</label>
                      <input id="homepage-stats-heading" className="form-control" value={settings.homepage.statsHeading} onChange={(event) => updateSetting('homepage', 'statsHeading', event.target.value)} required />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="homepage-stats-description">Statistics Section Description</label>
                      <textarea id="homepage-stats-description" className="form-control" rows="3" value={settings.homepage.statsDescription} onChange={(event) => updateSetting('homepage', 'statsDescription', event.target.value)} required />
                    </div>
                    {[1, 2, 3].map((cardNumber) => (
                      <React.Fragment key={cardNumber}>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor={`homepage-stat-${cardNumber}-number`}>Stats Card {cardNumber} Number</label>
                          <input id={`homepage-stat-${cardNumber}-number`} className="form-control" value={settings.homepage[`stat${cardNumber}Number`]} onChange={(event) => updateSetting('homepage', `stat${cardNumber}Number`, event.target.value)} required />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor={`homepage-stat-${cardNumber}-label`}>Stats Card {cardNumber} Label</label>
                          <input id={`homepage-stat-${cardNumber}-label`} className="form-control" value={settings.homepage[`stat${cardNumber}Label`]} onChange={(event) => updateSetting('homepage', `stat${cardNumber}Label`, event.target.value)} required />
                        </div>
                      </React.Fragment>
                    ))}
                    {[1, 2, 3].map((cardNumber) => (
                      <React.Fragment key={`feature-${cardNumber}`}>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor={`homepage-feature-${cardNumber}-title`}>Feature Card {cardNumber} Title</label>
                          <input id={`homepage-feature-${cardNumber}-title`} className="form-control" value={settings.homepage[`feature${cardNumber}Title`]} onChange={(event) => updateSetting('homepage', `feature${cardNumber}Title`, event.target.value)} required />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor={`homepage-feature-${cardNumber}-description`}>Feature Card {cardNumber} Description</label>
                          <textarea id={`homepage-feature-${cardNumber}-description`} className="form-control" rows="2" value={settings.homepage[`feature${cardNumber}Desc`]} onChange={(event) => updateSetting('homepage', `feature${cardNumber}Desc`, event.target.value)} required />
                        </div>
                      </React.Fragment>
                    ))}
                    <div className="col-12">
                      <label className="form-label" htmlFor="homepage-core-services-title">Core Services Heading</label>
                      <input id="homepage-core-services-title" className="form-control" value={settings.homepage.coreServicesTitle} onChange={(event) => updateSetting('homepage', 'coreServicesTitle', event.target.value)} required />
                    </div>
                    {[1, 2, 3].map((serviceNumber) => (
                      <div className="col-md-4" key={`core-service-${serviceNumber}`}>
                        <label className="form-label" htmlFor={`homepage-core-service-${serviceNumber}`}>Core Service {serviceNumber}</label>
                        <input id={`homepage-core-service-${serviceNumber}`} className="form-control" value={settings.homepage[`coreService${serviceNumber}`]} onChange={(event) => updateSetting('homepage', `coreService${serviceNumber}`, event.target.value)} required />
                      </div>
                    ))}
                    <div className="col-12">
                      <label className="form-label" htmlFor="homepage-footer-text">Footer Tagline / Description</label>
                      <textarea id="homepage-footer-text" className="form-control" rows="3" value={settings.homepage.footerText} onChange={(event) => updateSetting('homepage', 'footerText', event.target.value)} placeholder="Connecting students, departments, and employers through a transparent and efficient placement experience." />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary mt-4" disabled={saving}><FiSave className="me-2" />{saving ? 'Saving...' : 'Save Settings'}</button>
                  {saveSuccess && <div className="alert alert-success mt-3 mb-0" role="status">{saveSuccess}</div>}
                  {saveError && <div className="alert alert-danger mt-3 mb-0" role="alert">{saveError}</div>}
                </form>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

export default SystemConfig;