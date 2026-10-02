export const DEFAULT_INSPECTION_PLAN_TYPE_CODE = 'SPECIAL_INSPECTION';
export const DEFAULT_INSPECTION_PLAN_FREQUENCY_CODE = 'AD_HOC';

const INSPECTION_PLAN_TYPE_CODES = new Set([
  'ROUTINE_INSPECTION',
  'SPECIAL_INSPECTION',
  'DEPARTURE_AUDIT',
]);

const INSPECTION_PLAN_FREQUENCY_CODES = new Set([
  'YEARLY',
  'HALF_YEARLY',
  'QUARTERLY',
  'AD_HOC',
]);

const normalizeCode = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
};

const normalizeCsvCodes = (value: string | null | undefined): string | undefined => {
  const codes = (value ?? '')
    .split(',')
    .map(item => normalizeCode(item))
    .filter((item): item is string => Boolean(item));
  return codes.length ? Array.from(new Set(codes)).join(',') : undefined;
};

const isKnownCode = (value: string | undefined, codes: Set<string>) =>
  Boolean(value && codes.has(value));

export const normalizeInspectionPlanTypeCode = (value: string | null | undefined) =>
  normalizeCode(value);

export const normalizeInspectionPlanFrequencyCode = (value: string | null | undefined) =>
  normalizeCode(value);

export const normalizeInspectionPlanTypeFilter = (value: string | null | undefined) =>
  normalizeCsvCodes(value);

export const normalizeInspectionPlanFrequencyFilter = (value: string | null | undefined) =>
  normalizeCsvCodes(value);

export const isInspectionPlanTypeCode = (value: string | null | undefined) =>
  isKnownCode(normalizeInspectionPlanTypeCode(value), INSPECTION_PLAN_TYPE_CODES);

export const isInspectionPlanFrequencyCode = (value: string | null | undefined) =>
  isKnownCode(normalizeInspectionPlanFrequencyCode(value), INSPECTION_PLAN_FREQUENCY_CODES);
