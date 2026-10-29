import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api.js';

const FETCHABLE_DEPARTMENT_GROUPS = new Set(['health_science', 'git', 'law']);
const ACTIVE_DEPARTMENTS_ENDPOINT = 'http://localhost:8888/student-placement/placement_backend/api/student/get_active_departments.php';

const normalizeDepartmentName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

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

const semesterTwoChoiceGroups = (departments) => {
  const groups = new Map();
  const activeDepartments = departments.filter((department) => (
    String(department.status || (Number(department.is_active) === 1 ? 'active' : '')).trim().toLowerCase() === 'active'
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
  const semesterTwoGroups = useMemo(
    () => semesterTwoChoiceGroups(semesterTwoDepartments),
    [semesterTwoDepartments],
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
    <div className="student-preferences-form">
      {activePreferenceSemester === 1 && <div className="student-preferences-profile">
        <label className="student-preferences-field">
          <span>Registered Stream</span>
          <select className="student-preferences-select" aria-label="Registered Stream (Locked to your profile)" value={assignedStream.split(' ')[0]} disabled>
          <option value={assignedStream.split(' ')[0]}>{assignedStream.split(' ')[0]}</option>
          </select>
          <small>Locked to your student profile</small>
        </label>
      </div>}
      {activePreferenceSemester === 2 && semesterTwoOpen && (allocatedPlacementGroup || allocatedCollege) && (
        <div className="alert alert-info py-2" role="status">
          Semester 2 Preferences: Showing active departments across colleges in your assigned stream.
        </div>
      )}
      {activePreferenceSemester === 2 && (semesterTwoGroups.length === 0
        ? (semesterTwoOpen
          ? <p className="student-preferences-empty" role="status">No active departments are currently available in your assigned stream.</p>
          : null)
        : Array.from({ length: semesterTwoChoiceCount }, (_, index) => (
          <label className="student-preferences-field student-semester-two-choice" key={`semester-two-choice-${index}`} htmlFor={`semester-two-choice-${index}`}>
            <span><span className="student-choice-number">{index + 1}</span> Choice #{index + 1}</span>
            <select
              className="student-preferences-select"
              id={`semester-two-choice-${index}`}
              aria-label={`Choice #${index + 1}`}
              value={semesterTwoPreferences[index] || ''}
              disabled={disabled || !allocatedPlacementGroup}
              onChange={(event) => onSemesterTwoPreferenceChange(index, event.target.value)}
            >
              <option value="">-- Select department --</option>
              {semesterTwoGroups.map((group) => (
                <optgroup key={group.college} label={group.college}>
                  {group.options.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={
                        option.value !== (semesterTwoPreferences[index] || '')
                        && semesterTwoPreferences.some((selectedId, selectedIndex) => (
                          selectedIndex !== index && selectedId === option.value
                        ))
                      }
                    >
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <small>Choices may span colleges, but must remain in your assigned stream.</small>
          </label>
        )))}
      {activePreferenceSemester === 1 && groupValues.map((group, index) => {
        const choice = preferences[index] || { group: '', department: '', departments: [] };
        const activeDepartments = departmentsByGroup[choice.group] || [];
        const isDynamicGroup = FETCHABLE_DEPARTMENT_GROUPS.has(choice.group)
          && choice.group !== 'law';
        const rankedDepartments = isDynamicGroup ? activeDepartments : [];

        return (
          <section key={`preference-choice-${index}`} className="student-preference-card">
            <div className="student-preference-card-heading">
              <span className="student-choice-number">{index + 1}</span>
              <div>
                <h3>Choice #{index + 1}</h3>
                <p>{choice.group ? groupLabel(choice.group) : 'Choose a college or placement group'}</p>
              </div>
            </div>
            <label className="student-preferences-field" htmlFor={`preference-choice-${index}`}>
              <span>College or placement group</span>
            <select
              className="student-preferences-select"
              id={`preference-choice-${index}`}
              aria-label={`Choice #${index + 1}`}
              value={choice.group}
              disabled={disabled}
              onChange={(event) => onChoiceChange(index, 'group', event.target.value)}
            >
              <option value="">-- Select preference --</option>
              {groupValues.map((option) => (
                <option key={option} value={option}>
                  {groupLabel(option)}
                </option>
              ))}
            </select>
            </label>
            {loadingGroups[choice.group] && (
              <span className="student-preferences-loading" role="status">Loading available departments...</span>
            )}
            {isDynamicGroup && (
              <div className="student-preference-departments">
                <div className="student-preference-departments-heading">
                  <h4>Rank your departments</h4>
                  <span>{activeDepartments.length} active</span>
                </div>
                {rankedDepartments.map((department, departmentIndex) => {
                  const suffix = String.fromCharCode(97 + departmentIndex);
                  const selected = choice.departments || [];
                  return (
                    <label className="student-preferences-field student-subchoice-field" key={`${choice.group}-${department.id}`} htmlFor={`department-${index}-${departmentIndex}`}>
                      <span><span className="student-subchoice-index">{suffix}</span> Choice #{index + 1}{suffix}</span>
                      <select
                        className="student-preferences-select"
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
                  <p className="student-preferences-empty">No active departments are currently available for this group.</p>
                )}
              </div>
            )}
            {choice.group === 'law' && (
              <label className="student-preferences-field" htmlFor={`department-${index}-law`}>
                <span>Department ({activeDepartments.length} active)</span>
                <select
                  className="student-preferences-select"
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
            {['other_natural_science', 'other_social_science'].includes(choice.group)
              && <p className="student-preferences-broad-note">This broad group is submitted as one preference; it is not expanded into individual departments.</p>}
          </section>
        );
      })}
    </div>
  );
};

export default SubmitPreferences;
