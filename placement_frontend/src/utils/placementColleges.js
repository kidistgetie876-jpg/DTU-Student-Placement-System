export const PLACEMENT_STREAMS = [
  { id: 'default-natural', name: 'Natural Science', key: 'natural' },
  { id: 'default-social', name: 'Social Science', key: 'social' },
];

export const PLACEMENT_COLLEGES_BY_STREAM = {
  natural: [
    'Gafat Institute of Technology (GIT)',
    'Health Science',
    'Other Natural Science',
  ],
  social: [
    'School of Law',
    'Other Social Science',
  ],
};

export const normalizePlacementStreamKey = (stream) => {
  const normalized = String(stream || '').trim().toLowerCase();
  if (normalized.includes('social')) return 'social';
  return 'natural';
};

export const normalizeCollegeForStream = (college, stream) => {
  const streamKey = normalizePlacementStreamKey(stream);
  const normalized = String(college || '')
    .trim()
    .toLowerCase()
    .replace(/^(college|school) of\s+/i, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ');

  if (streamKey === 'natural') {
    if (/^(gafat|gefat) institute of technology$/.test(normalized)
      || ['technology', 'gafat tech', 'git', 'gafat institute of technology git'].includes(normalized)) {
      return PLACEMENT_COLLEGES_BY_STREAM.natural[0];
    }
    if (normalized === 'health science') return PLACEMENT_COLLEGES_BY_STREAM.natural[1];
    return PLACEMENT_COLLEGES_BY_STREAM.natural[2];
  }

  if (normalized === 'law') return PLACEMENT_COLLEGES_BY_STREAM.social[0];
  return PLACEMENT_COLLEGES_BY_STREAM.social[1];
};

export const getPlacementColleges = (stream) => (
  PLACEMENT_COLLEGES_BY_STREAM[normalizePlacementStreamKey(stream)]
);

export const getDepartmentPlacementMetadata = (college, stream) => {
  const canonicalCollege = normalizeCollegeForStream(college, stream);
  const placementGroupByCollege = {
    'Gafat Institute of Technology (GIT)': 'git',
    'Health Science': 'health_science',
    'Other Natural Science': 'other_natural_science',
    'School of Law': 'law',
    'Other Social Science': 'other_social_science',
  };
  const placementGroup = placementGroupByCollege[canonicalCollege];
  const offeredSemester = ['git', 'health_science', 'law'].includes(placementGroup) ? 1 : 2;

  return {
    placement_group: placementGroup,
    offered_semester: offeredSemester,
    is_first_semester_only: offeredSemester === 1 ? 1 : 0,
  };
};
