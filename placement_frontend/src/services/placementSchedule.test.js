import {
  getSubmissionWindowMessage,
  getUniversityDate,
  isSubmissionWindowOpen,
  validatePlacementSchedule,
} from './placementSchedule.js';

const validSchedule = {
  submissionStart: '2026-10-01',
  submissionDeadline: '2026-10-11',
  processingStart: '2026-10-12',
  processingEnd: '2026-10-20',
  resultsDate: '2026-10-21',
  appealStart: '2026-10-22',
  appealEnd: '2026-10-25',
};

describe('placement schedule helpers', () => {
  it('accepts a complete chronological schedule', () => {
    expect(validatePlacementSchedule(validSchedule)).toBe('');
  });

  it('rejects missing, malformed, and out-of-order schedule dates', () => {
    expect(validatePlacementSchedule({ ...validSchedule, appealEnd: '' })).toMatch(/Appeal Window End Date must be a valid date/);
    expect(validatePlacementSchedule({ ...validSchedule, processingStart: '2026-10-10' })).toMatch(/Placement Processing Start Date must be on or after Preference Submission Deadline/);
    expect(validatePlacementSchedule({ ...validSchedule, resultsDate: '2026-02-30' })).toMatch(/Results Announcement Date must be a valid date/);
  });

  it('keeps submissions closed until opening day and after the deadline', () => {
    expect(isSubmissionWindowOpen('2026-10-01', '2026-10-11', '2026-09-30')).toBe(false);
    expect(isSubmissionWindowOpen('2026-10-01', '2026-10-11', '2026-10-01')).toBe(true);
    expect(isSubmissionWindowOpen('2026-10-01', '2026-10-11', '2026-10-11')).toBe(true);
    expect(isSubmissionWindowOpen('2026-10-01', '2026-10-11', '2026-10-12')).toBe(false);
  });

  it('explains whether submission has not started or is already closed', () => {
    expect(getSubmissionWindowMessage('2026-10-01', '2026-10-11', '2026-09-30')).toContain('opens on 2026-10-01');
    expect(getSubmissionWindowMessage('2026-10-01', '2026-10-11', '2026-10-12')).toContain('closed on 2026-10-11');
  });

  it('uses the university timezone when determining the current calendar date', () => {
    expect(getUniversityDate(new Date('2026-10-07T22:00:00.000Z'))).toBe('2026-10-08');
  });
});