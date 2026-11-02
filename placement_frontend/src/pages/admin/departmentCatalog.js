import {
  getPlacementColleges,
  normalizePlacementStreamKey,
  PLACEMENT_STREAMS,
} from '../../utils/placementColleges.js';

export const DEFAULT_STREAMS = PLACEMENT_STREAMS.map(({ id, name }) => ({ id, name }));
export const DEFAULT_COLLEGES = PLACEMENT_STREAMS.flatMap(stream => (
  getPlacementColleges(stream.key).map((name, index) => ({
    id: `${stream.key}-${index}`,
    name,
    stream_id: stream.id,
    stream_name: stream.name,
  }))
));

const normalizeName = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeStreamName = name => {
  const normalized = normalizeName(name);
  if (normalized === 'natural' || normalized === 'natural science') return 'natural science';
  if (normalized === 'social' || normalized === 'social science') return 'social science';
  return normalized;
};

const canonicalCollegeName = (name, stream) => {
  const normalizedStream = normalizeStreamName(stream);
  if (!['natural science', 'social science'].includes(normalizedStream)) return '';
  const normalized = normalizeName(name)
    .replace(/^(college|school) of\s+/i, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ');
  const streamKey = normalizePlacementStreamKey(stream);

  if (streamKey === 'natural') {
    if (/^(gafat|gefat) institute of technology$/.test(normalized)
      || ['technology', 'gafat tech', 'git', 'gafat institute of technology git'].includes(normalized)) {
      return 'Gafat Institute of Technology (GIT)';
    }
    if (normalized === 'health science') return 'Health Science';
    if ([
      'other natural science',
      'natural and computational sciences',
      'agriculture and environmental sciences',
      'freshman faculty',
    ].includes(normalized)) return 'Other Natural Science';
  } else {
    if (normalized === 'law') return 'School of Law';
    if ([
      'other social science',
      'social sciences and humanities',
      'business and economics',
    ].includes(normalized)) return 'Other Social Science';
  }

  return '';
};

export const normalizeCatalogStreamName = name => {
  const stream = String(name || '').trim();
  const normalized = normalizeStreamName(stream);
  if (normalized === 'natural science') return 'Natural';
  if (normalized === 'social science') return 'Social';
  return stream;
};

export const normalizeCatalogCollegeName = (name, stream) => (
  canonicalCollegeName(name, stream) || String(name || '').trim()
);

export const mergeStreams = dynamicStreams => {
  const streams = DEFAULT_STREAMS.map(stream => {
    const savedStream = dynamicStreams.find(item => (
      normalizeStreamName(item.name) === normalizeStreamName(stream.name)
    ));
    return savedStream ? { ...stream, id: savedStream.id } : { ...stream };
  });

  dynamicStreams.forEach(item => {
    if (!item?.name || streams.some(stream => (
      normalizeStreamName(stream.name) === normalizeStreamName(item.name)
    ))) return;
    streams.push({ ...item });
  });

  return streams;
};

export const mergeColleges = (dynamicColleges, streams) => {
  const colleges = DEFAULT_COLLEGES.map(college => {
    const defaultStream = PLACEMENT_STREAMS.find(option => option.id === college.stream_id);
    const stream = streams.find(item => (
      normalizeStreamName(item.name) === normalizeStreamName(defaultStream.name)
    ));
    const catalogMatch = dynamicColleges.find(item => (
      normalizeStreamName(item.stream_name) === normalizeStreamName(defaultStream.name)
      && canonicalCollegeName(item.name, stream?.name || defaultStream.name) === college.name
    ));
    return {
      ...college,
      id: catalogMatch?.id ?? college.id,
      stream_id: stream?.id ?? college.stream_id,
      stream_name: stream?.name ?? defaultStream.name,
    };
  });

  dynamicColleges.forEach(item => {
    const stream = streams.find(candidate => (
      String(candidate.id) === String(item.stream_id)
      || normalizeName(candidate.name) === normalizeName(item.stream_name)
    ));
    if (!stream) return;

    const canonicalName = canonicalCollegeName(item.name, stream.name);
    const displayedName = canonicalName || String(item.name || '').trim();
    const existingCollege = colleges.find(college => (
      String(college.stream_id) === String(stream.id)
      && normalizeName(college.name) === normalizeName(displayedName)
    ));

    if (existingCollege) {
      existingCollege.id = item.id;
      return;
    }

    if (!displayedName) return;
    colleges.push({
      id: item.id,
      name: displayedName,
      stream_id: stream.id,
      stream_name: stream.name,
    });
  });

  return colleges;
};

export const getCollegesForStream = (colleges, streams, streamName) => {
  const stream = streams.find(item => normalizeName(item.name) === normalizeName(streamName));
  if (!stream) return [];
  return [...new Map(
    colleges
      .filter(college => String(college.stream_id) === String(stream.id))
      .map(college => [normalizeName(college.name), college])
  ).values()];
};
