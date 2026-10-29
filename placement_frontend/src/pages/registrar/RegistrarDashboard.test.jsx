import {
  getPlacementCandidateIneligibility,
  isDeferredPlacement,
  normalizePlacementCandidateChoices,
} from './RegistrarDashboard.jsx';

describe('isDeferredPlacement', () => {
  test.each(['pending_second_semester', 'Pending 2nd Semester', 'deferred'])(
    'recognizes %s as pending for the second semester',
    (status) => {
      expect(isDeferredPlacement({ status })).toBe(true);
    },
  );

  test.each(['placed', 'unassigned', 'pending 1st semester'])(
    'does not treat %s as pending for the second semester',
    (status) => {
      expect(isDeferredPlacement({ status })).toBe(false);
    },
  );
});

describe('normalizePlacementCandidateChoices', () => {
  it('retains distinct departments with the same rank across colleges', () => {
    const candidate = normalizePlacementCandidateChoices({
      semester_1_choices: [
        { dept_id: 7, dept_name: 'Medicine', college_name: 'Health Science', priority: 1, choice_eligible: false },
        { dept_id: 19, dept_name: 'Biology', college_name: 'Other Natural Science', priority: 1 },
        { dept_id: 25, dept_name: 'Computer Science', college_name: 'Gafat Institute of Technology', priority: 2 },
      ],
    }, 1);

    expect(candidate.choices.map(({ dept_name, college_name, priority, choice_eligible }) => ({
      dept_name,
      college_name,
      priority,
      choice_eligible,
    }))).toEqual([
      { dept_name: 'Medicine', college_name: 'Health Science', priority: 1, choice_eligible: false },
      { dept_name: 'Biology', college_name: 'Other Natural Science', priority: 1, choice_eligible: undefined },
      { dept_name: 'Computer Science', college_name: 'Gafat Institute of Technology', priority: 2, choice_eligible: undefined },
    ]);
  });
});

describe('getPlacementCandidateIneligibility', () => {
  const pendingSecondSemesterCandidate = {
    placement_status: 'Pending 2nd Semester',
    cgpa: 3,
    choices: [{ dept_id: 7, dept_name: 'Medicine', priority: 1 }],
  };

  it('allows an unassigned candidate with Semester 1 choices back into the run', () => {
    expect(getPlacementCandidateIneligibility({
      ...pendingSecondSemesterCandidate,
      has_first_semester_placement: false,
    }, 1)).toBe('');
  });

  it('keeps already assigned candidates out of a regular Semester 1 run', () => {
    expect(getPlacementCandidateIneligibility({
      ...pendingSecondSemesterCandidate,
      has_first_semester_placement: true,
    }, 1)).toBe('Student is not eligible for first-semester placement.');
  });
});