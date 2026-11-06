export const URLS = {
  login: '/login/',
  candidates: '/recruitment/candidate-view/',
  candidateCreate: '/recruitment/candidate-create/?container=true',
  assets: '/asset/asset-category-view/',
  allocations: '/asset/asset-request-allocation-view/',
  assetHistory: '/asset/asset-history/',
  meetings: '/pms/view-meetings/',
} as const;

export const MESSAGES = {
  required: 'This field is required.',
  noFilteredRecords: 'No filtered records found at the moment',
} as const;
