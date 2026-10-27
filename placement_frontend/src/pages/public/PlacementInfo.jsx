import React, { useEffect, useState } from "react";
import {
  BadgeCheck,
  Calculator,
  FileText,
  ListOrdered,
  Scale,
  ShieldCheck,
} from "lucide-react";
import api from '../../services/api.js';
import './PlacementInfo.css';

const defaultPlacementSettings = {
  submissionStart: '2026-10-01',
  submissionDeadline: '2026-10-11',
  processingStart: '2026-08-16',
  processingEnd: '2026-08-24',
  resultsDate: '2026-08-27',
  appealStart: '2026-08-27',
  appealEnd: '2026-08-30',
  guideTitle: 'Placement Information & Student Guide',
  guideDescription: 'This guide explains the university placement process, criteria, login steps, department capacity rules, and result timelines for students at Debre Tabor University.',
  rulesTabLabel: 'Rules & Criteria',
  capacityTabLabel: 'Capacity Overview',
  loginTabLabel: 'Login Guide',
  preferencesTabLabel: 'Rank Preferences',
  resultsTabLabel: 'Results & Appeal',
  scheduleTabLabel: 'Schedule',
  rulesTitle: 'Placement Rules and Criteria',
  rulesSummary: 'The university uses a transparent and fair merit-based placing process to assign students to departments based on academic performance and approved support points.',
  capacityTitle: 'Department Capacity Overview',
  capacitySummary: 'Each department has a fixed number of available seats determined by the university council and academic leadership.',
  capacityDescription: 'Capacity is limited and may vary by department, stream, and academic year. Students are ranked according to their placement score and department preferences.',
  loginTitle: 'Login & Account Guide',
  loginSummary: 'Students access the system through their assigned portal credentials provided by the Registrar’s Office.',
  loginStep1: 'Open the Student Portal and go to the login screen.',
  loginStep2: 'Use your registered username or student ID exactly as assigned by the Registrar.',
  loginStep3: 'Enter the password issued with your account credentials.',
  loginStep4: 'Access your dashboard to review placement information, select preferences, and view departmental assignments.',
  loginStep5: 'Contact the Registrar immediately if you forget your login details or your account is not working.',
  preferencesTitle: 'How to Select & Rank Preferences',
  preferencesSummary: 'Students select their stream and college, then rank departments by preference. Submitted choices can be updated until the deadline closes or results are published.',
  preferenceStep1: 'Choose your stream from the available academic options.',
  preferenceStep2: 'Select the college associated with your chosen stream.',
  preferenceStep3: 'Pick and rank your preferred departments from the list shown.',
  preferenceStep4: 'Submit your ranking and update or reorder your choices any time before the deadline closes, unless results have already been published.',
  preferencesImportantNote: 'You may edit submitted preferences until the deadline closes or the Registrar publishes placement results.',
  resultsTitle: 'How to View Results & Appeal',
  resultsSummary: 'Once placement processing is complete, students can review their merit score and assigned department in the portal.',
  viewResultsTitle: 'View Placement Results',
  viewResultsText: 'Log in to your dashboard and check your merit score, rank, and final department placement. This helps you understand the result before taking any further action.',
  submitAppealTitle: 'Submit an Appeal',
  submitAppealText: 'If you believe there is an error in the placement calculation, missing data, or institutional processing issue, submit an appeal within the official appeal window.',
  scheduleTitle: 'Placement Schedule & Deadlines',
  scheduleSummary: 'The university follows a structured timeline to allow enough time for student decision-making, processing, and review.',
};

const defaultPlacementRules = {
  formula: {
    gpa_weight: 50,
    grade_12_weight: 20,
    coc_weight: 30,
    g12_total_base: 600,
  },
  affirmative_action: {
    female_bonus_points: 5,
    disability_bonus_points: 5,
    minority_male_bonus_points: 5,
    minority_female_bonus_points: 10,
    minority_disability_bonus_points: 10,
    female_disability_minority_bonus_points: 15,
    description: 'Without minority or emerging-region status, eligible female and disability bonuses are added together. For students with minority or emerging-region status, the applicable combined scenario amount is used instead of stacking separate bonuses.',
  },
  choice_preference: {
    title: 'Department Choice Preference Order Policy',
    details: [
      'Eligible students are considered in descending order of total merit score.',
      'For each student, the system checks the submitted department choices in preference order: 1st, then 2nd, then 3rd.',
      'The student is assigned to the highest-ranked choice with an eligible stream, matching scope, and available quota/capacity.',
      'If all listed choices are full or ineligible, the student remains unassigned for review.',
    ],
  },
  capacity_quota: {
    departments: [],
  },
  tie_breaking: {
    title: 'Tie-Breaking Policy',
    criteria: [
      'Higher CGPA',
      'Higher Grade 12 examination result',
    ],
    details: 'If these measures are also equal, the placement system applies its additional affirmative-action priority rules.',
  },
  appeals: {
    title: 'Appeals Policy and Criteria',
    criteria: [
      'A suspected error in the placement score or its underlying academic records.',
      'Missing or incorrect eligibility, affirmative-action, or student profile information.',
      'A concern that submitted department choices or capacity rules were not applied correctly.',
    ],
    submission: 'Sign in to the student portal and submit an appeal to the Registrar with a clear explanation and supporting evidence.',
    deadline_start: '2026-08-27',
    deadline_end: '2026-08-30',
    deadline_note: 'Appeals must be submitted within the published appeal window. Check the dates below and university announcements for any approved changes.',
  },
  publishing: {
    title: 'Provisional and Official Result Publishing',
    provisional: 'Placement outcomes produced during processing are provisional and remain subject to verification and Registrar review.',
    official: 'Results become official only after the Registrar publishes them in the system. Students should rely on the published result in their portal.',
    appeal: 'Use the appeal process during the published appeal window if you identify a result or record issue.',
  },
  schedule: {
    submissionStart: '2026-10-01',
    submissionDeadline: '2026-10-11',
    processingStart: '2026-08-16',
    processingEnd: '2026-08-24',
    resultsDate: '2026-08-27',
    appealStart: '2026-08-27',
    appealEnd: '2026-08-30',
  },
};

const getWithServiceUnavailableRetry = async (url, attempts = 3) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await api.get(url);
    } catch (error) {
      if (error.response?.status !== 503 || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => window.setTimeout(resolve, attempt * 1000));
    }
  }

  throw new Error(`Unable to load ${url} after ${attempts} attempts.`);
};

const normalizePlacementRules = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const normalized = {
    ...defaultPlacementRules,
    ...source,
    formula: { ...defaultPlacementRules.formula, ...(source.formula || {}) },
    affirmative_action: { ...defaultPlacementRules.affirmative_action, ...(source.affirmative_action || {}) },
    choice_preference: { ...defaultPlacementRules.choice_preference, ...(source.choice_preference || {}) },
    capacity_quota: { ...defaultPlacementRules.capacity_quota, ...(source.capacity_quota || {}) },
    tie_breaking: { ...defaultPlacementRules.tie_breaking, ...(source.tie_breaking || {}) },
    appeals: { ...defaultPlacementRules.appeals, ...(source.appeals || {}) },
    publishing: { ...defaultPlacementRules.publishing, ...(source.publishing || {}) },
    schedule: { ...defaultPlacementRules.schedule, ...(source.schedule || {}) },
  };
  if (!Array.isArray(normalized.choice_preference.details)) {
    normalized.choice_preference.details = defaultPlacementRules.choice_preference.details;
  }
  if (!Array.isArray(normalized.tie_breaking.criteria)) {
    normalized.tie_breaking.criteria = defaultPlacementRules.tie_breaking.criteria;
  }
  if (!Array.isArray(normalized.appeals.criteria)) {
    normalized.appeals.criteria = defaultPlacementRules.appeals.criteria;
  }
  if (!Array.isArray(normalized.capacity_quota.departments)) {
    normalized.capacity_quota.departments = [];
  }
  return normalized;
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

function RuleCard({ icon: Icon, title, children }) {
  return (
    <section className="border rounded-4 h-100 p-3 bg-white shadow-sm" aria-label={title}>
      <div className="d-flex align-items-center gap-2 mb-3">
        <Icon size={20} aria-hidden="true" style={{ color: '#0a2d6d', flexShrink: 0 }} />
        <h3 className="h6 fw-bold mb-0" style={{ color: '#0a2d6d' }}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function PlacementRulesContent({ rules }) {
  const formula = rules.formula;
  const bonuses = rules.affirmative_action;
  const choices = rules.choice_preference;
  const tieBreaking = rules.tie_breaking;
  const appeals = rules.appeals;
  const publishing = rules.publishing;
  const bonusRows = [
    ['Female students', bonuses.female_bonus_points],
    ['Students with a disability', bonuses.disability_bonus_points],
    ['Minority / emerging-region students', bonuses.minority_male_bonus_points],
  ];
  const list = (items) => (
    <ul className="small text-muted ps-3 mb-0">
      {items.map((item, index) => <li className="mb-2" key={`${index}-${item}`}>{item}</li>)}
    </ul>
  );

  return (
    <div className="row g-3">
      <div className="col-12">
        <RuleCard icon={Calculator} title="Placement Formula and Merit Score">
          <p className="small text-muted mb-2">
            Total score = (CGPA / 4.0 × {formula.gpa_weight})
            {' + '} (Grade 12 mark / {formula.g12_total_base} × {formula.grade_12_weight})
            {' + '} (COC / 30 × {formula.coc_weight})
            {' + '} applicable affirmative-action bonus.
          </p>
          <p className="small text-muted mb-0">
            Each academic component is limited to its stated maximum before weighting. Bonus eligibility and amounts are applied using the rules below.
          </p>
        </RuleCard>
      </div>

      <div className="col-12 col-lg-6">
        <RuleCard icon={BadgeCheck} title="Affirmative-Action Bonus Points">
          <ul className="small text-muted ps-3 mb-3">
            {bonusRows.map(([label, points]) => (
              <li className="mb-2" key={label}>{label}: <strong>+{points} points</strong></li>
            ))}
          </ul>
          <p className="small text-muted mb-0">{bonuses.description}</p>
        </RuleCard>
      </div>

      <div className="col-12 col-lg-6">
        <RuleCard icon={ListOrdered} title={choices.title}>
          {list(choices.details)}
        </RuleCard>
      </div>

      <div className="col-12 col-lg-6">
        <RuleCard icon={Scale} title={tieBreaking.title}>
          <ol className="small text-muted ps-3 mb-2">
            {tieBreaking.criteria.slice(0, 2).map((criterion, index) => (
              <li className="mb-2" key={`${index}-${criterion}`}>{criterion}</li>
            ))}
          </ol>
          <p className="small text-muted mb-0">{tieBreaking.details}</p>
        </RuleCard>
      </div>

      <div className="col-12 col-lg-6">
        <RuleCard icon={FileText} title={appeals.title}>
          {list(appeals.criteria)}
          <p className="small text-muted mt-3 mb-2">{appeals.submission}</p>
          <p className="small fw-semibold mb-1" style={{ color: '#0a2d6d' }}>
            Submission window: {formatPlacementDate(appeals.deadline_start || rules.schedule.appealStart)}
            {' – '}{formatPlacementDate(appeals.deadline_end || rules.schedule.appealEnd)}
          </p>
          <p className="small text-muted mb-0">{appeals.deadline_note}</p>
        </RuleCard>
      </div>

      <div className="col-12 col-lg-6">
        <RuleCard icon={ShieldCheck} title={publishing.title}>
          <p className="small text-muted"><strong>Provisional:</strong> {publishing.provisional}</p>
          <p className="small text-muted"><strong>Official:</strong> {publishing.official}</p>
          <p className="small text-muted mb-0">{publishing.appeal}</p>
        </RuleCard>
      </div>

    </div>
  );
}

const placementGuidance = {
  rules: {
    titleKey: 'rulesTitle',
    summaryKey: 'rulesSummary',
    body: (settings) => (
      <PlacementRulesContent rules={settings.rulesData} />
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
        {settings.capacitiesLoading ? (
          <div className="alert alert-info mb-0" role="status">Loading department capacities...</div>
        ) : settings.capacitiesError ? (
          <div className="alert alert-danger d-flex flex-wrap justify-content-between align-items-center gap-2" role="alert">
            <span>{settings.capacitiesError}</span>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={settings.onRetryCapacities}>
              Try again
            </button>
          </div>
        ) : settings.capacityDepartments.length === 0 ? (
          <div className="alert alert-secondary mb-0" role="status">No department capacities are currently available.</div>
        ) : (
          <div className="table-responsive border rounded-4 shadow-sm">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th scope="col" className="px-3 py-3">Department ID</th>
                  <th scope="col" className="py-3">Stream / College</th>
                  <th scope="col" className="py-3">Department Name</th>
                  <th scope="col" className="text-end px-3 py-3">Maximum Student Quota</th>
                </tr>
              </thead>
              <tbody>
                {settings.capacityDepartments.map((department) => (
                  <tr key={department.id}>
                    <td className="px-3">{department.id}</td>
                    <td>
                      <div>{department.stream || '—'}</div>
                      {department.college_name && (
                        <div className="small text-muted">{department.college_name}</div>
                      )}
                    </td>
                    <td className="fw-semibold">{department.name}</td>
                    <td className="text-end px-3 fw-bold">{department.capacity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
  const [rulesData, setRulesData] = useState(defaultPlacementRules);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [capacityDepartments, setCapacityDepartments] = useState([]);
  const [capacitiesLoading, setCapacitiesLoading] = useState(false);
  const [capacitiesError, setCapacitiesError] = useState('');
  const [capacityRetry, setCapacityRetry] = useState(0);
  const activeContent = placementGuidance[activeTab];

  useEffect(() => {
    if (activeTab !== 'capacity') return undefined;

    let isMounted = true;
    setCapacitiesLoading(true);
    setCapacitiesError('');

    api.get('api/common/get_public_capacities.php')
      .then(({ data }) => {
        if (!data?.success || !Array.isArray(data.departments)) {
          throw new Error(data?.message || 'Unable to load department capacities.');
        }
        if (isMounted) setCapacityDepartments(data.departments);
      })
      .catch((error) => {
        if (!isMounted) return;
        setCapacitiesError(
          error.response?.data?.message
          || error.message
          || 'Unable to load department capacities. Please try again.'
        );
      })
      .finally(() => {
        if (isMounted) setCapacitiesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, capacityRetry]);

  useEffect(() => {
    let isMounted = true;
    const loadPlacementSettings = async () => {
      if (isMounted) {
        setSettingsLoading(true);
        setSettingsError('');
      }
      const [portalResult, rulesResult] = await Promise.allSettled([
        getWithServiceUnavailableRetry('api/common/system_settings_api.php'),
        getWithServiceUnavailableRetry('api/common/get_placement_rules.php'),
      ]);
      if (!isMounted) return;

      const failedRequests = [portalResult, rulesResult].filter((result) => result.status === 'rejected');
      const dates = portalResult.status === 'fulfilled'
        ? portalResult.value.data?.settings?.placement || {}
        : {};
      const response = rulesResult.status === 'fulfilled' ? rulesResult.value.data : null;
      const rulesFailed = rulesResult.status === 'rejected' || !response?.success;
      const liveRules = !rulesFailed
        ? normalizePlacementRules(response.data)
        : defaultPlacementRules;
      const schedule = {
        ...defaultPlacementRules.schedule,
        ...liveRules.schedule,
        ...dates,
      };
      setRulesData({
        ...liveRules,
        schedule,
        appeals: {
          ...liveRules.appeals,
          deadline_start: dates.appealStart || liveRules.appeals.deadline_start || schedule.appealStart,
          deadline_end: dates.appealEnd || liveRules.appeals.deadline_end || schedule.appealEnd,
        },
      });
      setPlacementSettings((current) => ({
        ...current,
        ...schedule,
        ...dates,
      }));
      setSettingsError(rulesFailed
        ? 'Placement rules are temporarily unavailable. Complete default rules are shown.'
        : failedRequests.length > 0
          ? 'Some portal schedule details could not be loaded. Available placement rules are shown.'
          : '');
      setSettingsLoading(false);
    };

    loadPlacementSettings();
    window.addEventListener('system-settings-updated', loadPlacementSettings);
    const refreshInterval = window.setInterval(loadPlacementSettings, 15000);

    return () => {
      isMounted = false;
      window.removeEventListener('system-settings-updated', loadPlacementSettings);
      window.clearInterval(refreshInterval);
    };
  }, []);

  return (
    <div className="container placement-info-page py-5 pt-5" style={{ maxWidth: "1200px", paddingTop: "40px" }}>
      <div className="text-center mb-4 pt-3">
        <span className="badge rounded-pill px-3 py-2 mb-3" style={{ background: "rgba(10, 45, 109, 0.08)", color: "#0a2d6d" }}>Student Guidance</span>
        <h1 className="mb-4 text-2xl font-bold text-slate-800" style={{ color: "#0a2d6d" }}>{placementSettings.guideTitle}</h1>
        <p className="placement-info-description mx-auto mb-6 max-w-2xl text-center text-sm text-slate-600">
          {placementSettings.guideDescription}
        </p>
      </div>

      {settingsLoading && (
        <div className="alert alert-info" role="status">Connecting to server...</div>
      )}
      {!settingsLoading && settingsError && (
        <div className="alert alert-warning" role="status">{settingsError}</div>
      )}

      <div className="card border-0 shadow-sm rounded-4 overflow-hidden" style={{ background: "#ffffff" }}>
        <div className="card-header placement-info-tabs flex flex-wrap items-center justify-center gap-3 p-3" role="group" aria-label="Placement information sections" style={{ background: "linear-gradient(135deg, #0a2d6d, #123f8a)" }}>
            {guidanceTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="placement-info-tab inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {placementSettings[`${tab.id}TabLabel`] || tab.label}
              </button>
            ))}
        </div>

        <div className="card-body p-4 p-lg-5">
          <div className="mb-4">
            <h2 className="placement-info-section-title mb-4 text-2xl font-bold text-slate-800">{placementSettings[activeContent.titleKey] || activeContent.title}</h2>
            <p className="placement-info-section-description mb-0 text-sm leading-relaxed text-slate-600">{placementSettings[activeContent.summaryKey] || activeContent.summary}</p>
          </div>

          {typeof activeContent.body === 'function'
            ? activeContent.body({
              ...placementSettings,
              rulesData,
              capacityDepartments,
              capacitiesLoading,
              capacitiesError,
              onRetryCapacities: () => setCapacityRetry((retry) => retry + 1),
            })
            : activeContent.body}
        </div>
      </div>
    </div>
  );
}

export default PlacementInfo;
