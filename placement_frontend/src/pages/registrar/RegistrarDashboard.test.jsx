import { isDeferredPlacement } from './RegistrarDashboard.jsx';

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