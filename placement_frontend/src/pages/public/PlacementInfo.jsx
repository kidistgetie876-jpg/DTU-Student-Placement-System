import React, { useEffect, useState } from "react";
import api from '../../services/api.js';
<<<<<<< HEAD:placement_frontend/src/pages/public/PlacementInfo.jsx

const defaultPlacementSettings = {
  submissionStart: '2026-10-01',
  submissionDeadline: '2026-10-11',
  processingStart: '2026-10-12',
  processingEnd: '2026-10-20',
  resultsDate: '2026-10-21',
  appealStart: '2026-10-22',
  appealEnd: '2026-10-25',
=======
import {
  SYSTEM_SETTINGS_UPDATED_EVENT,
  SYSTEM_SETTINGS_UPDATED_STORAGE_KEY,
} from '../../services/systemSettingsEvents.js';

const defaultPlacementSettings = {
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:src/pages/public/PlacementInfo.jsx
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
};

const formatPlacementDate = (value) => {
  if (!value) return 'To be announced';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
};

const guidanceTabs = [
  { id: "rules", label: "Rules & Criteria" },
  { id: "capacity", label: "Capacity Overview" },
  { id: "login", label: "Login Guide" },
  { id: "preferences", label: "Rank Preferences" },
  { id: "results", label: "Results & Appeal" },
  { id: "schedule", label: "Schedule" },
];

const placementGuidance = {
  rules: {
    titleKey: 'rulesTitle',
    summaryKey: 'rulesSummary',
    body: (settings) => (
      <div>
        <p className="mb-3 text-muted">
          {settings.rulesIntroduction}
        </p>
        <div className="alert alert-light border rounded-4 p-3 mb-3" style={{ background: "rgba(10, 45, 109, 0.04)" }}>
          <strong className="d-block mb-2" style={{ color: "#0a2d6d" }}>
            Total Placement Score = (GPA × {settings.gpa_weight}%) + (Grade 12 Result × {settings.grade_12_weight}%) + (COC Score × {settings.coc_weight}%) + Affirmative Action Points
          </strong>
          <div className="small text-muted">
            <div>GPA weight: {settings.gpa_weight}%</div>
            <div>Grade 12 result: {settings.grade_12_weight}%</div>
            <div>COC score: {settings.coc_weight}%</div>
            <div>Gender affirmative action: {settings.gender_weight}%</div>
            <div>Disability affirmative action: {settings.disability_weight}%</div>
            <div>Minority affirmative action: {settings.minority_weight}%</div>
          </div>
        </div>
        <div className="row g-3">
          <div className="col-md-4">
            <div className="border rounded-4 h-100 p-3 bg-white shadow-sm">
              <h6 className="fw-bold mb-2" style={{ color: "#0a2d6d" }}>{settings.genderEquityTitle} ({settings.gender_weight}%)</h6>
              <p className="small text-muted mb-0">{settings.genderEquityText}</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="border rounded-4 h-100 p-3 bg-white shadow-sm">
              <h6 className="fw-bold mb-2" style={{ color: "#0a2d6d" }}>{settings.disabilitySupportTitle} ({settings.disability_weight}%)</h6>
              <p className="small text-muted mb-0">{settings.disabilitySupportText}</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="border rounded-4 h-100 p-3 bg-white shadow-sm">
              <h6 className="fw-bold mb-2" style={{ color: "#0a2d6d" }}>{settings.minoritySupportTitle} ({settings.minority_weight}%)</h6>
              <p className="small text-muted mb-0">{settings.minoritySupportText}</p>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  capacity: {
    titleKey: 'capacityTitle',
    summaryKey: 'capacitySummary',
    body: (settings) => (
      <div>
        <p className="text-muted mb-3">
          {settings.capacityDescription}
        </p>
        <div className="row g-3">
          {[1, 2, 3, 4, 5].map((groupNumber) => ({
            name: settings[`capacityGroup${groupNumber}`],
            description: settings[`capacityGroup${groupNumber}Description`],
            groupNumber,
          })).map(({ name: group, description, groupNumber }) => (
            <div className="col-md-6 col-xl-4" key={groupNumber}>
              <div className="border rounded-4 p-3 h-100 bg-white shadow-sm">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="fw-bold" style={{ color: "#0a2d6d" }}>{group}</span>
                  <span className="badge rounded-pill" style={{ background: "rgba(215, 183, 90, 0.18)", color: "#0a2d6d" }}>{groupNumber} Group</span>
                </div>
                <p className="small text-muted mb-0">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  login: {
    titleKey: 'loginTitle',
    summaryKey: 'loginSummary',
    body: (settings) => (
      <div>
        <ol className="ps-3 mb-0">
          {[settings.loginStep1, settings.loginStep2, settings.loginStep3, settings.loginStep4, settings.loginStep5].map((step) => <li className="mb-3" key={step}>{step}</li>)}
        </ol>
      </div>
    ),
  },
  preferences: {
    titleKey: 'preferencesTitle',
    summaryKey: 'preferencesSummary',
    body: (settings) => (
      <div>
        <div className="row g-3">
          {[
            settings.preferenceStep1,
            settings.preferenceStep2,
            settings.preferenceStep3,
            settings.preferenceStep4,
          ].map((step, index) => (
            <div className="col-md-6" key={step}>
              <div className="border rounded-4 p-3 h-100 bg-white shadow-sm">
                <div className="d-flex align-items-center mb-2">
                  <span className="badge rounded-circle me-2 d-inline-flex align-items-center justify-content-center" style={{ width: "2rem", height: "2rem", background: "#0a2d6d", color: "#f9d770" }}>{index + 1}</span>
                  <strong style={{ color: "#0a2d6d" }}>Step {index + 1}</strong>
                </div>
                <p className="small text-muted mb-0">{step}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="alert alert-warning border-0 rounded-4 mt-3 mb-0" style={{ background: "rgba(215, 183, 90, 0.15)", color: "#0a2d6d" }}>
          <strong>Important:</strong> {settings.preferencesImportantNote}
        </div>
      </div>
    ),
  },
  results: {
    titleKey: 'resultsTitle',
    summaryKey: 'resultsSummary',
    body: (settings) => (
      <div className="row g-3">
        <div className="col-md-6">
          <div className="border rounded-4 p-3 h-100 bg-white shadow-sm">
            <h6 className="fw-bold mb-2" style={{ color: "#0a2d6d" }}>{settings.viewResultsTitle}</h6>
            <p className="small text-muted mb-0">{settings.viewResultsText}</p>
          </div>
        </div>
        <div className="col-md-6">
          <div className="border rounded-4 p-3 h-100 bg-white shadow-sm">
            <h6 className="fw-bold mb-2" style={{ color: "#0a2d6d" }}>{settings.submitAppealTitle}</h6>
            <p className="small text-muted mb-0">{settings.submitAppealText}</p>
          </div>
        </div>
      </div>
    ),
  },
  schedule: {
    titleKey: 'scheduleTitle',
    summaryKey: 'scheduleSummary',
    body: (placementSettings) => (
      <div className="row g-3">
        {[
          { label: "Preference Submission", value: `${formatPlacementDate(placementSettings.submissionStart)} - ${formatPlacementDate(placementSettings.submissionDeadline)}`, tone: "info" },
          { label: "Placement Processing Period", value: `${formatPlacementDate(placementSettings.processingStart)} - ${formatPlacementDate(placementSettings.processingEnd)}`, tone: "primary" },
          { label: "Results Announcement Date", value: formatPlacementDate(placementSettings.resultsDate), tone: "success" },
          { label: "Appeal Window", value: `${formatPlacementDate(placementSettings.appealStart)} - ${formatPlacementDate(placementSettings.appealEnd)}`, tone: "danger" },
        ].map((item) => (
          <div className="col-md-6 col-xl-4" key={item.label}>
            <div className="border rounded-4 p-3 h-100 bg-white shadow-sm">
              <span className={`badge rounded-pill mb-2 ${item.tone === "info" ? "bg-primary-subtle text-primary" : item.tone === "warning" ? "bg-warning-subtle text-dark" : item.tone === "success" ? "bg-success-subtle text-success" : item.tone === "danger" ? "bg-danger-subtle text-danger" : "bg-secondary-subtle text-dark"}`}>
                {item.label}
              </span>
              <div className="fw-bold" style={{ color: "#0a2d6d" }}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
};

function PlacementInfo() {
  const [activeTab, setActiveTab] = useState("rules");
  const [placementSettings, setPlacementSettings] = useState(defaultPlacementSettings);
  const [rulesSettings, setRulesSettings] = useState(defaultPlacementSettings);
<<<<<<< HEAD:placement_frontend/src/pages/public/PlacementInfo.jsx
=======
  const [placementDates, setPlacementDates] = useState({
    submissionStart: '',
    submissionDeadline: '',
    processingStart: '',
    processingEnd: '',
    resultsDate: '',
    appealStart: '',
    appealEnd: '',
  });
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:src/pages/public/PlacementInfo.jsx
  const activeContent = placementGuidance[activeTab];

  useEffect(() => {
    let isMounted = true;
    const loadPlacementSettings = async () => {
      const [portalResult, rulesResult] = await Promise.allSettled([
        api.get('api/common/system_settings_api.php'),
        api.get('api/registrar/get_placement_settings.php'),
      ]);
      if (!isMounted) return;

<<<<<<< HEAD:placement_frontend/src/pages/public/PlacementInfo.jsx
      const dates = portalResult.status === 'fulfilled'
        ? portalResult.value.data?.settings?.placement || {}
        : {};
=======
      const res = portalResult.status === 'fulfilled' ? portalResult.value : { data: {} };
      const dates = res.data?.settings?.placement || res.data?.placement || {};
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:src/pages/public/PlacementInfo.jsx
      const registrarRules = rulesResult.status === 'fulfilled'
        ? rulesResult.value.data?.settings || rulesResult.value.data?.data || rulesResult.value.data || {}
        : {};
      const weightKeys = ['gpa_weight', 'grade_12_weight', 'coc_weight', 'gender_weight', 'disability_weight', 'minority_weight'];
<<<<<<< HEAD:placement_frontend/src/pages/public/PlacementInfo.jsx

      setPlacementSettings((current) => ({ ...current, ...dates }));
=======
      const dateKeys = ['submissionStart', 'submissionDeadline', 'processingStart', 'processingEnd', 'resultsDate', 'appealStart', 'appealEnd'];

      setPlacementSettings((current) => ({ ...current, ...dates }));
      if (portalResult.status === 'fulfilled') {
        setPlacementDates(dateKeys.reduce((currentDates, key) => ({
          ...currentDates,
          [key]: dates[key] || '',
        }), {}));
      }
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:src/pages/public/PlacementInfo.jsx
      setRulesSettings((current) => weightKeys.reduce((next, key) => {
        const value = dates[key] ?? registrarRules[key] ?? current[key];
        return { ...next, [key]: Number.isFinite(Number(value)) ? Number(value) : current[key] };
      }, current));
    };

<<<<<<< HEAD:placement_frontend/src/pages/public/PlacementInfo.jsx
    loadPlacementSettings();
    window.addEventListener('system-settings-updated', loadPlacementSettings);
=======
    const handleStorage = (event) => {
      if (event.key === SYSTEM_SETTINGS_UPDATED_STORAGE_KEY) loadPlacementSettings();
    };

    loadPlacementSettings();
    window.addEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, loadPlacementSettings);
    window.addEventListener('storage', handleStorage);
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:src/pages/public/PlacementInfo.jsx
    const refreshInterval = window.setInterval(loadPlacementSettings, 15000);

    return () => {
      isMounted = false;
<<<<<<< HEAD:placement_frontend/src/pages/public/PlacementInfo.jsx
      window.removeEventListener('system-settings-updated', loadPlacementSettings);
=======
      window.removeEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, loadPlacementSettings);
      window.removeEventListener('storage', handleStorage);
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:src/pages/public/PlacementInfo.jsx
      window.clearInterval(refreshInterval);
    };
  }, []);

  return (
    <div className="container py-5 pt-5" style={{ maxWidth: "1200px", paddingTop: "40px" }}>
      <div className="text-center mb-4 pt-3">
        <span className="badge rounded-pill px-3 py-2 mb-3" style={{ background: "rgba(10, 45, 109, 0.08)", color: "#0a2d6d" }}>Student Guidance</span>
        <h1 className="display-6 fw-bold mb-3" style={{ color: "#0a2d6d" }}>{placementSettings.guideTitle}</h1>
        <p className="mx-auto text-muted" style={{ maxWidth: "760px" }}>
          {placementSettings.guideDescription}
        </p>
      </div>

      <div className="card border-0 shadow-sm rounded-4 overflow-hidden" style={{ background: "#ffffff" }}>
        <div className="card-header border-0 p-3" style={{ background: "linear-gradient(135deg, #0a2d6d, #123f8a)" }}>
          <div className="d-flex flex-wrap gap-2">
            {guidanceTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`btn btn-sm rounded-pill px-3 ${activeTab === tab.id ? "btn-warning text-dark fw-bold" : "btn-outline-light"}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {placementSettings[`${tab.id}TabLabel`] || tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card-body p-4 p-lg-5">
          <div className="mb-4">
            <h2 className="h3 fw-bold mb-2" style={{ color: "#0a2d6d" }}>{placementSettings[activeContent.titleKey] || activeContent.title}</h2>
            <p className="text-muted mb-0">{placementSettings[activeContent.summaryKey] || activeContent.summary}</p>
          </div>

<<<<<<< HEAD:placement_frontend/src/pages/public/PlacementInfo.jsx
          {typeof activeContent.body === 'function' ? activeContent.body({ ...placementSettings, ...rulesSettings }) : activeContent.body}
=======
          {typeof activeContent.body === 'function'
            ? activeContent.body(activeTab === 'schedule' ? placementDates : { ...placementSettings, ...rulesSettings })
            : activeContent.body}
>>>>>>> 0804fa7a9466ce2c9657e71058cbe88e873d7e70:src/pages/public/PlacementInfo.jsx
        </div>
      </div>
    </div>
  );
}

export default PlacementInfo;
