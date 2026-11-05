import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api.js';

const FETCHABLE_DEPARTMENT_GROUPS = new Set(['health_science', 'git', 'law']);
const ACTIVE_DEPARTMENTS_ENDPOINT = 'http://localhost:8888/student-placement/placement_backend/api/student/get_active_departments.php';

const normalizeDepartmentName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeSemesterTwoDepartmentId = (value) => String(value ?? '')
  .trim()
  .replace(/^department:/i, '');
const isSemesterTwoDepartmentSelectedElsewhere = (departmentId, preferences, currentIndex) => {
  const normalizedDepartmentId = normalizeSemesterTwoDepartmentId(departmentId);
  return Boolean(normalizedDepartmentId) && preferences.some((selectedId, selectedIndex) => (
    selectedIndex !== currentIndex
    && normalizeSemesterTwoDepartmentId(selectedId) === normalizedDepartmentId
  ));
};
const normalizeCollegeName = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .replace(/&/g, 'and')
  .replace(/^(college|school) of /, '')
  .replace(/sciences\b/g, 'science')
  .replace(/^(social science|social sciences)$/, 'other social science')
  .replace(/other social sciences/g, 'other social science')
  .replace(/other natural sciences/g, 'other natural science');

export const updateSemesterTwoPreference = (currentPreferences, index, selectedId, choiceCount) => {
  const next = [...currentPreferences];
  while (next.length < choiceCount) next.push('');
  next[index] = selectedId;
  return next;
};

export const hasDuplicateDepartmentChoices = (
  preferenceSemester,
  firstSemesterPreferences,
  semesterTwoPreferences,
) => {
  if (Number(preferenceSemester) !== 2) {
    const selectedGroups = firstSemesterPreferences.map((choice) => choice.group).filter(Boolean);
    if (new Set(selectedGroups).size !== selectedGroups.length) return true;
  }

  const selectedDepartments = Number(preferenceSemester) === 2
    ? semesterTwoPreferences.filter(Boolean).map(String)
    : firstSemesterPreferences.flatMap((choice) => (
      choice.group === 'law'
        ? [choice.department]
        : FETCHABLE_DEPARTMENT_GROUPS.has(choice.group)
          ? choice.departments || []
          : []
    )).map(normalizeDepartmentName).filter(Boolean);

  return new Set(selectedDepartments).size !== selectedDepartments.length;
};

const isSemesterOneDepartmentSelectedElsewhere = (
  preferences,
  departmentName,
  choiceIndex,
  departmentIndex,
) => {
  const normalizedName = normalizeDepartmentName(departmentName);
  if (!normalizedName) return false;

  return preferences.some((choice, otherChoiceIndex) => {
    if (choice.group === 'law') {
      return otherChoiceIndex !== choiceIndex
        && normalizeDepartmentName(choice.department) === normalizedName;
    }
    if (!FETCHABLE_DEPARTMENT_GROUPS.has(choice.group)) return false;

    return (choice.departments || []).some((selectedDepartment, otherDepartmentIndex) => (
      !(otherChoiceIndex === choiceIndex && otherDepartmentIndex === departmentIndex)
      && normalizeDepartmentName(selectedDepartment) === normalizedName
    ));
  });
};

const semesterTwoChoiceGroups = (departments, allocatedCollege) => {
  const normalizedAllocatedCollege = normalizeCollegeName(allocatedCollege);
  const groups = new Map();
  const activeDepartments = departments.filter((department) => (
    String(department.status || (Number(department.is_active) === 1 ? 'active' : '')).trim().toLowerCase() === 'active'
    && (!normalizedAllocatedCollege || normalizeCollegeName(
      department.college_name || department.college || department.faculty,
    ) === normalizedAllocatedCollege)
    && (
      department.offered_semester === null
      || department.offered_semester === undefined
      || department.offered_semester === ''
      || Number(department.offered_semester) === 2
      || (
        Number(department.offered_semester) === 1
        && !['1', 'true', 'yes', 'on'].includes(String(department.is_first_semester_only ?? '').trim().toLowerCase())
      )
    )
  ));
  const ensureGroup = (collegeName) => {
    const college = String(collegeName || 'Other').trim() || 'Other';
    const key = college.toLocaleLowerCase();
    if (!groups.has(key)) groups.set(key, { college, options: [] });
    return groups.get(key);
  };
  activeDepartments.forEach((department) => {
    const college = String(department.college_name || department.college || 'Other').trim() || 'Other';
    ensureGroup(college).options.push({
      value: `department:${department.id}`,
      label: department.name,
      kind: 'department',
    });
  });
  return [...groups.values()].map((group) => ({
    ...group,
    options: group.options.sort((left, right) => left.label.localeCompare(right.label)),
  }));
};

const SubmitPreferences = ({
  assignedStream,
  preferenceSemester,
  activeSemester,
  groupValues,
  groupLabel,
  preferences,
  onChoiceChange,
  onDepartmentsLoaded,
  onDepartmentLoadError,
  disabled,
  semesterTwoDepartments,
  semesterTwoPreferences,
  semesterTwoChoiceCount,
  onSemesterTwoPreferenceChange,
  allocatedPlacementGroup = '',
  allocatedCollege = '',
  semesterTwoOpen = true,
}) => {
  const activePreferenceSemester = Number(activeSemester) === 1
    ? 1
    : Number(activeSemester) === 2
      && Number(preferenceSemester) === 2
      && semesterTwoOpen
      && (allocatedPlacementGroup || allocatedCollege)
      ? 2
      : preferenceSemester;
  const [loadingGroups, setLoadingGroups] = useState({});
  const [departmentsByGroup, setDepartmentsByGroup] = useState({});
  const [semesterTwoSelectionsTouched, setSemesterTwoSelectionsTouched] = useState(false);
  const semesterTwoGroups = useMemo(
    () => semesterTwoChoiceGroups(semesterTwoDepartments, allocatedCollege),
    [allocatedCollege, semesterTwoDepartments],
  );
  const selectedDynamicGroupKey = useMemo(
    () => [...new Set(preferences.map((choice) => choice.group).filter((group) => FETCHABLE_DEPARTMENT_GROUPS.has(group)))]
      .sort()
      .join(','),
    [preferences],
  );

  const loadGroupDepartments = useCallback(async (group, signal) => {
    if (!FETCHABLE_DEPARTMENT_GROUPS.has(group)) return;
    const collegeName = groupLabel(group);
    setLoadingGroups((current) => ({ ...current, [group]: true }));
    try {
      const response = await api.get(ACTIVE_DEPARTMENTS_ENDPOINT, {
        params: { college_name: collegeName, status: 'active' },
        signal,
      });
      const responseDepartments = response.data?.departments;
      if (!Array.isArray(responseDepartments)) {
        throw new Error(response.data?.message || 'The department service returned an invalid response.');
      }

      const fetchedDepartments = responseDepartments.map((department) => ({
        ...department,
        college_name: /^law$/i.test(String(department.college_name || department.college || department.faculty || '').trim())
          ? 'School of Law'
          : department.college_name || department.college || department.faculty || collegeName,
        preference_group: group,
      }));
      setDepartmentsByGroup((current) => ({ ...current, [group]: responseDepartments }));
      onDepartmentsLoaded(group, fetchedDepartments);
    } catch (error) {
      if (signal?.aborted) return;
      console.error(`Unable to refresh ${groupLabel(group)} departments:`, error);
      onDepartmentLoadError(`Unable to refresh ${groupLabel(group)} departments. Please try again.`);
    } finally {
      if (!signal?.aborted) {
        setLoadingGroups((current) => ({ ...current, [group]: false }));
      }
    }
  }, [groupLabel, onDepartmentLoadError, onDepartmentsLoaded]);

  useEffect(() => {
    const selectedGroups = selectedDynamicGroupKey.split(',').filter(Boolean);
    if (!selectedGroups.length) return undefined;

    const controller = new AbortController();
    selectedGroups.forEach((group) => loadGroupDepartments(group, controller.signal));
    return () => {
      controller.abort();
    };
  }, [loadGroupDepartments, selectedDynamicGroupKey]);

  useEffect(() => {
    const refreshSelectedGroups = () => {
      selectedDynamicGroupKey.split(',').filter(Boolean)
        .forEach((group) => loadGroupDepartments(group));
    };
    window.addEventListener('focus', refreshSelectedGroups);
    return () => window.removeEventListener('focus', refreshSelectedGroups);
  }, [loadGroupDepartments, selectedDynamicGroupKey]);

  return (
    <div className="space-y-4">
      {activePreferenceSemester === 1 && <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          <span>Registered Stream</span>
          <select className="w-full rounded-xl border border-slate-300 bg-slate-100 px-3 py-2.5 text-sm text-slate-600 disabled:cursor-not-allowed" aria-label="Registered Stream (Locked to your profile)" value={assignedStream.split(' ')[0]} disabled>
          <option value={assignedStream.split(' ')[0]}>{assignedStream.split(' ')[0]}</option>
          </select>
          <small className="text-xs font-normal text-slate-500">Locked to your student profile</small>
        </label>
      </div>}
      {activePreferenceSemester === 2 && semesterTwoOpen && (allocatedPlacementGroup || allocatedCollege) && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900" role="status">
          Active departments in your assigned college.
        </div>
      )}
      {activePreferenceSemester === 2 && (semesterTwoGroups.length === 0
        ? (semesterTwoOpen
          ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">No active departments are currently available in your assigned college.</p>
          : null)
        : Array.from({ length: semesterTwoChoiceCount }, (_, index) => (
          <label className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm sm:p-5" key={`semester-two-choice-${index}`} htmlFor={`semester-two-choice-${index}`}>
            <span className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">{index + 1}</span> Choice #{index + 1}</span>
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              id={`semester-two-choice-${index}`}
              aria-label={`Choice #${index + 1}`}
              value={semesterTwoPreferences[index] || ''}
              disabled={disabled || !(allocatedPlacementGroup || allocatedCollege)}
              onChange={(event) => {
                const requestedDepartmentId = normalizeSemesterTwoDepartmentId(event.target.value);
                const selectedElsewhereIndex = requestedDepartmentId
                  ? semesterTwoPreferences.findIndex((selectedId, selectedIndex) => (
                    selectedIndex !== index
                    && normalizeSemesterTwoDepartmentId(selectedId) === requestedDepartmentId
                  ))
                  : -1;
                setSemesterTwoSelectionsTouched(true);
                if (selectedElsewhereIndex >= 0) {
                  const currentSelection = semesterTwoPreferences[index] || '';
                  onSemesterTwoPreferenceChange(index, event.target.value);
                  onSemesterTwoPreferenceChange(selectedElsewhereIndex, currentSelection);
                  return;
                }
                if (isSemesterTwoDepartmentSelectedElsewhere(
                  event.target.value,
                  semesterTwoPreferences,
                  index,
                )) {
                  return;
                }
                onSemesterTwoPreferenceChange(index, event.target.value);
              }}
            >
              <option value="">-- Select department --</option>
              {semesterTwoGroups.map((group) => (
                <optgroup key={group.college} label={group.college}>
                  {group.options.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={semesterTwoSelectionsTouched
                        && isSemesterTwoDepartmentSelectedElsewhere(
                          option.value,
                          semesterTwoPreferences,
                          index,
                        )}
                    >
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <small className="text-xs font-normal text-slate-500">Choices must be from your assigned college.</small>
          </label>
        )))}
      {activePreferenceSemester === 1 && groupValues.map((group, index) => {
        const choice = preferences[index] || { group: '', department: '', departments: [] };
        const activeDepartments = departmentsByGroup[choice.group] || [];
        const isDynamicGroup = FETCHABLE_DEPARTMENT_GROUPS.has(choice.group)
          && choice.group !== 'law';
        const rankedDepartments = isDynamicGroup ? activeDepartments : [];

        return (
          <section key={`preference-choice-${index}`} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100 font-bold text-sky-800">{index + 1}</span>
              <div>
                <h3 className="mb-0 text-base font-bold text-slate-900">Choice #{index + 1}</h3>
                <p className="mb-0 text-sm text-slate-500">{choice.group ? groupLabel(choice.group) : 'Choose a college or placement group'}</p>
              </div>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-slate-700" htmlFor={`preference-choice-${index}`}>
              <span>College or placement group</span>
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              id={`preference-choice-${index}`}
              aria-label={`Choice #${index + 1}`}
              value={choice.group}
              disabled={disabled}
              onChange={(event) => onChoiceChange(index, 'group', event.target.value)}
            >
              <option value="">-- Select preference --</option>
              {groupValues.map((option) => (
                <option
                  key={option}
                  value={option}
                  disabled={option !== choice.group && preferences.some((otherChoice, otherIndex) => (
                    otherIndex !== index && otherChoice.group === option
                  ))}
                >
                  {groupLabel(option)}
                </option>
              ))}
            </select>
            </label>
            {loadingGroups[choice.group] && (
              <span className="text-sm font-medium text-sky-700" role="status">Loading available departments...</span>
            )}
            {isDynamicGroup && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="mb-0 text-sm font-bold text-slate-900">Rank your departments</h4>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{activeDepartments.length} active</span>
                </div>
                {rankedDepartments.map((department, departmentIndex) => {
                  const suffix = String.fromCharCode(97 + departmentIndex);
                  const selected = choice.departments || [];
                  return (
                    <label className="grid gap-2 text-sm font-semibold text-slate-700" key={`${choice.group}-${department.id}`} htmlFor={`department-${index}-${departmentIndex}`}>
                      <span className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">{suffix}</span> Choice #{index + 1}{suffix}</span>
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                        id={`department-${index}-${departmentIndex}`}
                        aria-label={`Choice #${index + 1}${suffix} Department`}
                        value={selected[departmentIndex] || ''}
                        disabled={disabled}
                        onChange={(event) => onChoiceChange(index, 'departments', {
                          index: departmentIndex,
                          name: event.target.value,
                        })}
                      >
                        <option value="">-- Select Department --</option>
                        {activeDepartments.map((availableDepartment) => (
                          <option
                            key={availableDepartment.id}
                            value={availableDepartment.name}
                            disabled={
                              normalizeDepartmentName(availableDepartment.name)
                                !== normalizeDepartmentName(selected[departmentIndex] || '')
                              && isSemesterOneDepartmentSelectedElsewhere(
                                preferences,
                                availableDepartment.name,
                                index,
                                departmentIndex,
                              )
                            }
                          >
                            {availableDepartment.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
                {!activeDepartments.length && !loadingGroups[choice.group] && (
                  <p className="mb-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">No active departments are currently available for this group.</p>
                )}
              </div>
            )}
            {choice.group === 'law' && (
              <label className="grid gap-2 text-sm font-semibold text-slate-700" htmlFor={`department-${index}-law`}>
                <span>Department ({activeDepartments.length} active)</span>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  id={`department-${index}-law`}
                  aria-label={`Choice #${index + 1} Department`}
                  value={choice.department || ''}
                  disabled={disabled}
                  onChange={(event) => onChoiceChange(index, 'department', event.target.value)}
                >
                  <option value="">-- Select Department --</option>
                  {activeDepartments.map((department) => (
                    <option
                      key={department.id}
                      value={department.name}
                      disabled={
                        normalizeDepartmentName(department.name)
                          !== normalizeDepartmentName(choice.department || '')
                        && isSemesterOneDepartmentSelectedElsewhere(
                          preferences,
                          department.name,
                          index,
                          null,
                        )
                      }
                    >
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default SubmitPreferences;
