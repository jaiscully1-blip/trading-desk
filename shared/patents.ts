// USPTO Open Data Portal (data.uspto.gov) patent search, used for "patents granted per year" on the Company page.
// Request shape from the ODP Patent File Wrapper search API: POST /api/v1/patent/applications/search with an X-API-KEY
// header; the response carries `count`. (unverified until a key is added: check the numbers against the ODP website.)

export const ODP_SEARCH = 'https://api.uspto.gov/api/v1/patent/applications/search';

/** Company name as patent applicants usually write it: drop share classes and legal suffixes. */
export function applicantName(name: string): string {
  let s = name.replace(/\s+class\s+[a-c]\b.*$/i, '').trim();
  for (let i = 0; i < 2; i++) s = s.replace(/,?\s+(inc|corp|corporation|co|company|ltd|limited|plc|holdings?|group|n\.?v|s\.?a|ag|se)\.?$/i, '').trim();
  return s;
}

/** Search body: utility patents granted in `year` whose first applicant matches the company. Only the count is needed. */
export function grantedQuery(org: string, year: number) {
  return {
    q: `applicationMetaData.firstApplicantName:"${org.replace(/["\\]/g, '')}"`,
    filters: [{ name: 'applicationMetaData.applicationTypeLabelName', value: ['Utility'] }],
    rangeFilters: [{ field: 'applicationMetaData.grantDate', valueFrom: `${year}-01-01`, valueTo: `${year}-12-31` }],
    pagination: { offset: 0, limit: 1 },
    fields: ['applicationNumberText'],
  };
}

export const countOf = (j: any): number => Number(j?.count ?? j?.totalCount ?? 0) || 0;
