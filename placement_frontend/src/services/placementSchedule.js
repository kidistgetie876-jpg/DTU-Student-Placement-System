export const placementDateFields = [
  ['submissionStart', 'Preference Submission Start Date'],
  ['submissionDeadline', 'Preference Submission Deadline'],
  ['processingStart', 'Placement Processing Start Date'],
  ['processingEnd', 'Placement Processing End Date'],
  ['resultsDate', 'Results Announcement Date'],
  ['appealStart', 'Appeal Window Start Date'],
  ['appealEnd', 'Appeal Window End Date'],
];

const parseDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
};

export const validatePlacementSchedule = (schedule) => {
  for (const [key, label] of placementDateFields) {
    if (!parseDate(schedule?.[key])) return `${label} must be a valid date.`;
  }

  for (let index = 1; index < placementDateFields.length; index += 1) {
    const [previousKey, previousLabel] = placementDateFields[index - 1];
    const [key, label] = placementDateFields[index];
    if (schedule[key] < schedule[previousKey]) {
      return `${label} must be on or after ${previousLabel}.`;
    }
  }

  return '';
};

export const getUniversityDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const isSubmissionWindowOpen = (submissionStart, submissionDeadline, currentDate = getUniversityDate()) => {
  if (!submissionDeadline) return true;
  if (!parseDate(submissionDeadline) || (submissionStart && !parseDate(submissionStart))) return false;
  return (!submissionStart || currentDate >= submissionStart) && currentDate <= submissionDeadline;
};

export const getSubmissionWindowMessage = (submissionStart, submissionDeadline, currentDate = getUniversityDate()) => {
  if (!submissionDeadline || !parseDate(submissionDeadline) || (submissionStart && !parseDate(submissionStart))) {
    return 'The preference submission schedule is not configured correctly. Please contact the Registrar Office.';
  }
  if (submissionStart && currentDate < submissionStart) {
    return `Preference submission opens on ${submissionStart}.`;
  }
  return `The preference submission deadline closed on ${submissionDeadline}. New submissions are no longer accepted.`;
};