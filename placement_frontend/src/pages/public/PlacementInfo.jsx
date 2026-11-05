import React, { useEffect, useState } from "react";
import {
  BadgeCheck,
  Building2,
  Calculator,
  ListOrdered,
} from "lucide-react";
import api from '../../services/api.js';

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
  if (!value || typeof value !== 'object'
    || !value.overview
    || !Array.isArray(value.formula?.components)
    || !Array.isArray(value.affirmative_action?.bonus_points)
    || !Array.isArray(value.choice_preference?.details)
    || !Array.isArray(value.capacity_quota?.details)
    || !Array.isArray(value.tie_breaking?.criteria)
    || !Array.isArray(value.appeals?.criteria)) {
    throw new Error('Public placement rules are missing or incomplete.');
  }
  return value;
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
  { id: "rules", label: "Rules & Criteria", inactiveStyle: "border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100" },
  { id: "capacity", label: "Capacity Overview", inactiveStyle: "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100" },
  { id: "login", label: "Login Guide", inactiveStyle: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100" },
  { id: "preferences", label: "Rank Preferences", inactiveStyle: "border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100" },
  { id: "results", label: "Results & Appeal", inactiveStyle: "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100" },
  { id: "schedule", label: "Schedule", inactiveStyle: "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100" },
];

function RuleCard({ icon: Icon, title, children, accent = 'indigo' }) {
  const accentStyles = {
    indigo: { border: 'border-l-indigo-600', icon: 'text-indigo-700', iconBg: 'bg-indigo-100' },
    emerald: { border: 'border-l-emerald-600', icon: 'text-emerald-700', iconBg: 'bg-emerald-100' },
    blue: { border: 'border-l-blue-600', icon: 'text-blue-700', iconBg: 'bg-blue-100' },
    amber: { border: 'border-l-amber-500', icon: 'text-amber-700', iconBg: 'bg-amber-100' },
    rose: { border: 'border-l-rose-600', icon: 'text-rose-700', iconBg: 'bg-rose-100' },
    teal: { border: 'border-l-teal-600', icon: 'text-teal-700', iconBg: 'bg-teal-100' },
  };
  const styles = accentStyles[accent] || accentStyles.indigo;

  return (
    <section className={`h-full rounded-xl border border-slate-200 border-l-4 ${styles.border} bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6`} aria-label={title}>
      <div className="mb-4 flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${styles.iconBg} ${styles.icon}`}>
          <Icon size={20} aria-hidden="true" />
        </span>
        <h3 className="mb-0 text-lg font-bold leading-snug text-slate-800">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function PlacementRulesContent({ rules }) {
  const formula = rules.formula;
  const bonuses = rules.affirmative_action;
  const choices = rules.choice_preference;
  const capacity = rules.capacity_quota;
  const list = (items) => (
    <ul className="mb-0 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
      {items.map((item, index) => <li className="pl-1" key={`${index}-${item}`}>{item}</li>)}
    </ul>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <RuleCard icon={Calculator} title={formula.title} accent="indigo">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {formula.components.map((component) => (
              <div className="rounded-lg bg-indigo-50 px-4 py-3" key={component.weight_key}>
                <p className="mb-1 text-sm font-bold text-indigo-950">{component.label}</p>
                <p className="mb-0 text-sm text-indigo-900">
                  {component.denominator ? `Score / ${component.denominator} × ` : ''}
                  {component.weight}%
                </p>
              </div>
            ))}
          </div>
          <p className="mb-0 text-sm leading-6 text-slate-700">{formula.bonus_note}</p>
        </RuleCard>
      </div>

      <div>
        <RuleCard icon={BadgeCheck} title={bonuses.title} accent="emerald">
          <ul className="mb-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
            {bonuses.bonus_points.map(({ label, points, value_key: valueKey }) => (
              <li className="pl-1" key={valueKey}>{label}: <strong className="font-bold text-emerald-800">+{points} points</strong></li>
            ))}
          </ul>
          <p className="mb-0 text-sm leading-6 text-slate-700">{bonuses.description}</p>
        </RuleCard>
      </div>

      <div>
        <RuleCard icon={ListOrdered} title={choices.title} accent="blue">
          {list(choices.details)}
        </RuleCard>
      </div>

      <div>
        <RuleCard icon={Building2} title={capacity.title} accent="teal">
          <p className="mb-3 text-sm leading-6 text-slate-700">
            General quota: <strong>{capacity.general_quota_percent}%</strong>
            {' · '}Reserved female quota: <strong>{capacity.reserved_female_quota_percent}%</strong>
          </p>
          {list(capacity.details)}
        </RuleCard>
      </div>

    </div>
  );
}

const placementGuidance = {
  rules: {
    titleKey: null,
    summaryKey: null,
    body: (settings) => (
      <PlacementRulesContent rules={settings.rulesData} />
    ),
  },
  capacity: {
    titleKey: 'capacityTitle',
    summaryKey: 'capacitySummary',
    body: (settings) => (
      <div>
        <p className="mb-4 text-sm leading-6 text-slate-600">
          {settings.capacityDescription}
        </p>
        {settings.capacitiesLoading ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status">Loading department capacities...</div>
        ) : settings.capacitiesError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
            <span>{settings.capacitiesError}</span>
            <button type="button" className="rounded-lg border border-rose-300 bg-white px-3 py-2 font-semibold text-rose-800 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" onClick={settings.onRetryCapacities}>
              Try again
            </button>
          </div>
        ) : settings.capacityDepartments.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700" role="status">No department capacities are currently available.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-3">Department ID</th>
                  <th scope="col" className="px-4 py-3">Stream / College</th>
                  <th scope="col" className="px-4 py-3">Department Name</th>
                  <th scope="col" className="px-4 py-3 text-right">Maximum Student Quota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {settings.capacityDepartments.map((department) => (
                  <tr className="transition-colors hover:bg-indigo-50/50" key={department.id}>
                    <td className="whitespace-nowrap px-4 py-3">{department.id}</td>
                    <td className="px-4 py-3">
                      <div>{department.stream || '—'}</div>
                      {department.college_name && (
                        <div className="mt-1 text-xs text-slate-500">{department.college_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{department.name}</td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-900">{department.capacity}</td>
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
        <ol className="space-y-3">
          {[settings.loginStep1, settings.loginStep2, settings.loginStep3, settings.loginStep4, settings.loginStep5].map((step, index) => (
            <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 shadow-sm" key={step}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    ),
  },
  preferences: {
    titleKey: 'preferencesTitle',
    summaryKey: 'preferencesSummary',
    body: (settings) => (
      <div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            settings.preferenceStep1,
            settings.preferenceStep2,
            settings.preferenceStep3,
            settings.preferenceStep4,
          ].map((step, index) => (
            <div key={step}>
              <div className="h-full rounded-xl border border-slate-200 bg-gradient-to-br from-white to-indigo-50/70 p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-700 text-sm font-bold text-white">{index + 1}</span>
                  <strong className="text-indigo-950">Step {index + 1}</strong>
                </div>
                <p className="mb-0 text-sm leading-6 text-slate-700">{step}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <strong>Important:</strong> {settings.preferencesImportantNote}
        </div>
      </div>
    ),
  },
  results: {
    titleKey: 'resultsTitle',
    summaryKey: 'resultsSummary',
    body: (settings) => (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="h-full rounded-xl border border-blue-200 border-l-4 border-l-blue-600 bg-gradient-to-br from-white to-blue-50 p-5 shadow-sm">
            <h3 className="mb-2 text-lg font-bold text-blue-950">{settings.viewResultsTitle}</h3>
            <p className="mb-0 text-sm leading-6 text-slate-700">{settings.viewResultsText}</p>
          </div>
        </div>
        <div>
          <div className="h-full rounded-xl border border-rose-200 border-l-4 border-l-rose-600 bg-gradient-to-br from-white to-rose-50 p-5 shadow-sm">
            <h3 className="mb-2 text-lg font-bold text-rose-950">{settings.submitAppealTitle}</h3>
            <p className="mb-0 text-sm leading-6 text-slate-700">{settings.submitAppealText}</p>
          </div>
        </div>
      </div>
    ),
  },
  schedule: {
    titleKey: 'scheduleTitle',
    summaryKey: 'scheduleSummary',
    body: (placementSettings) => (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Preference Submission", value: `${formatPlacementDate(placementSettings.submissionStart)} - ${formatPlacementDate(placementSettings.submissionDeadline)}`, tone: "info" },
          { label: "Placement Processing Period", value: `${formatPlacementDate(placementSettings.processingStart)} - ${formatPlacementDate(placementSettings.processingEnd)}`, tone: "primary" },
          { label: "Results Announcement Date", value: formatPlacementDate(placementSettings.resultsDate), tone: "success" },
          { label: "Appeal Window", value: `${formatPlacementDate(placementSettings.appealStart)} - ${formatPlacementDate(placementSettings.appealEnd)}`, tone: "danger" },
        ].map((item) => (
          <div key={item.label}>
            <div className="h-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <span className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${item.tone === "info" ? "bg-blue-100 text-blue-800" : item.tone === "warning" ? "bg-amber-100 text-amber-900" : item.tone === "success" ? "bg-emerald-100 text-emerald-800" : item.tone === "danger" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>
                {item.label}
              </span>
              <div className="text-sm font-bold leading-6 text-slate-900">{item.value}</div>
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
  const [rulesData, setRulesData] = useState(null);
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
      let liveRules = null;
      let rulesErrorMessage = '';
      try {
        if (rulesResult.status === 'rejected') throw rulesResult.reason;
        if (!response?.success) {
          throw new Error(response?.message || 'Live placement rules are not configured.');
        }
        liveRules = normalizePlacementRules(response.data);
      } catch (error) {
        rulesErrorMessage = error.response?.data?.message || error.message || 'Live placement rules are unavailable.';
      }
      const rulesFailed = liveRules === null;
      const schedule = {
        ...(liveRules?.schedule || {}),
        ...dates,
      };
      setRulesData(liveRules ? {
        ...liveRules,
        schedule,
        appeals: {
          ...liveRules.appeals,
          deadline_start: dates.appealStart || liveRules.appeals.deadline_start || schedule.appealStart || '',
          deadline_end: dates.appealEnd || liveRules.appeals.deadline_end || schedule.appealEnd || '',
        },
      } : null);
      setPlacementSettings((current) => ({
        ...current,
        ...schedule,
        ...dates,
      }));
      setSettingsError(rulesFailed
        ? rulesErrorMessage
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
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8 text-center">
        <span className="mb-4 inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-800">Student Guidance</span>
        <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{placementSettings.guideTitle}</h1>
        <p className="mx-auto mb-0 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
          {placementSettings.guideDescription}
        </p>
      </header>

      {settingsLoading && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status">Connecting to server...</div>
      )}
      {!settingsLoading && settingsError && (rulesData || activeTab !== 'rules') && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">{settingsError}</div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-indigo-100 bg-gradient-to-r from-slate-50 via-blue-50 to-indigo-100 p-4 sm:gap-3 sm:p-5" role="group" aria-label="Placement information sections">
            {guidanceTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${activeTab === tab.id ? 'border-transparent bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-900/25' : `${tab.inactiveStyle} shadow-sm hover:-translate-y-0.5 hover:shadow-md`}`}
                style={activeTab === tab.id
                  ? { backgroundImage: "linear-gradient(to right, #2563eb, #4f46e5)", color: "#ffffff" }
                  : undefined}
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {placementSettings[`${tab.id}TabLabel`] || tab.label}
              </button>
            ))}
        </div>

        <div className="p-5 sm:p-8">
          {(activeTab !== 'rules' || rulesData) && (
            <div className="mb-6 border-b border-slate-200 pb-5">
              <h2 className="mb-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                {activeTab === 'rules'
                  ? rulesData.overview.title
                  : placementSettings[activeContent.titleKey] || activeContent.title}
              </h2>
              <p className="mb-0 max-w-4xl text-sm leading-6 text-slate-600 sm:text-base">
                {activeTab === 'rules'
                  ? rulesData.overview.summary
                  : placementSettings[activeContent.summaryKey] || activeContent.summary}
              </p>
            </div>
          )}

          {activeTab === 'rules' && settingsLoading ? (
            <div className="space-y-4" role="status" aria-label="Loading placement rules">
              <span className="sr-only">Loading placement rules</span>
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
              </div>
            </div>
          ) : activeTab === 'rules' && !rulesData ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
              {settingsError || 'Live placement rules are not configured.'}
            </div>
          ) : typeof activeContent.body === 'function'
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
        </section>
      </main>
  );
}

export default PlacementInfo;
