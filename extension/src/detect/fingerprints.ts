import { AtsFingerprint } from './types';

/**
 * Data-driven catalog of ATS fingerprints.
 * Scored using independent signals (DOM, script src, iframe src, URL params, host, JSON-LD).
 * Verified against live fixtures in tests/fixtures/<ats>/.
 */
export const ATS_FINGERPRINTS: AtsFingerprint[] = [
  // --------------------------------------------------------------------------
  // Tier 1: Greenhouse
  // --------------------------------------------------------------------------
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    threshold: 30,
    signals: [
      { kind: 'host', pattern: /(boards|job-boards)\.(eu\.)?greenhouse\.io$/i, weight: 25 },
      { kind: 'dom', selector: 'form#application_form', weight: 40 },
      { kind: 'dom', selector: '#grnhse_app', weight: 40 },
      { kind: 'dom', selector: 'iframe#grnhse_iframe', weight: 40 },
      { kind: 'dom', selector: 'input[id^="question_"], textarea[id^="question_"]', weight: 35 },
      { kind: 'dom', selector: 'input[name^="job_application[answers_attributes]"]', weight: 35 },
      { kind: 'dom', selector: 'input[name="job_application[first_name]"]', weight: 30 },
      { kind: 'scriptSrc', pattern: /greenhouse\.io\/(embed\/job_board|job_board)/i, weight: 35 },
      { kind: 'scriptSrc', pattern: /controllers\/call_to_action\/greenhouse/i, weight: 35 },
      { kind: 'iframeSrc', pattern: /greenhouse\.io/i, weight: 35 },
      { kind: 'urlParam', name: 'gh_jid', weight: 25 },
      { kind: 'urlParam', name: 'gh_src', weight: 20 }
    ]
  },

  // --------------------------------------------------------------------------
  // Tier 1: Lever
  // --------------------------------------------------------------------------
  {
    id: 'lever',
    name: 'Lever',
    threshold: 30,
    signals: [
      { kind: 'host', pattern: /jobs\.(eu\.)?lever\.co$/i, weight: 25 },
      { kind: 'dom', selector: 'form#application-form, .application-form', weight: 40 },
      { kind: 'dom', selector: 'input[name="name"][type="text"]', weight: 20 },
      { kind: 'dom', selector: 'input[name^="urls["]', weight: 35 },
      { kind: 'dom', selector: '[name^="cards["]', weight: 35 },
      { kind: 'dom', selector: 'input[name="org"]', weight: 25 },
      { kind: 'scriptSrc', pattern: /(assets\.)?lever\.co/i, weight: 30 },
      { kind: 'iframeSrc', pattern: /jobs\.lever\.co/i, weight: 35 },
      { kind: 'urlParam', name: 'lever-source', weight: 25 }
    ]
  },

  // --------------------------------------------------------------------------
  // Tier 1: Ashby
  // --------------------------------------------------------------------------
  {
    id: 'ashby',
    name: 'Ashby',
    threshold: 30,
    signals: [
      { kind: 'host', pattern: /jobs\.ashbyhq\.com$/i, weight: 25 },
      { kind: 'dom', selector: '#_systemfield_name, input[name="_systemfield_name"]', weight: 45 },
      { kind: 'dom', selector: '#_systemfield_email, input[name="_systemfield_email"]', weight: 40 },
      { kind: 'dom', selector: '#_systemfield_resume, input[name="_systemfield_resume"]', weight: 40 },
      { kind: 'dom', selector: '#ashby_embed', weight: 40 },
      { kind: 'dom', selector: '.ashby-application-form-input-autocomplete', weight: 35 },
      { kind: 'scriptSrc', pattern: /(ashbyhq\.com|ashbyprd\.com)/i, weight: 35 },
      { kind: 'iframeSrc', pattern: /jobs\.ashbyhq\.com/i, weight: 35 },
      { kind: 'urlParam', name: 'ashby_jid', weight: 25 }
    ]
  },

  // --------------------------------------------------------------------------
  // Tier 1: Workday
  // --------------------------------------------------------------------------
  {
    id: 'workday',
    name: 'Workday',
    threshold: 30,
    signals: [
      { kind: 'host', pattern: /(myworkdayjobs|myworkdaysite)\.com$/i, weight: 25 },
      { kind: 'dom', selector: '[data-automation-id="legalNameSection_firstName"]', weight: 45 },
      { kind: 'dom', selector: '[data-automation-id="legalNameSection_lastName"]', weight: 40 },
      { kind: 'dom', selector: '[data-automation-id="jobSearchPage"], [data-automation-id="keywordSearchInput"]', weight: 35 },
      { kind: 'dom', selector: '[data-automation-id="file-upload-input-ref"]', weight: 35 },
      { kind: 'dom', selector: '[data-automation-id="bottom-navigation-next-button"]', weight: 35 },
      { kind: 'dom', selector: '[data-automation-id]', weight: 20 },
      { kind: 'scriptSrc', pattern: /workday/i, weight: 25 }
    ]
  },

  // --------------------------------------------------------------------------
  // Tier 2: SmartRecruiters
  // --------------------------------------------------------------------------
  {
    id: 'smartrecruiters',
    name: 'SmartRecruiters',
    threshold: 30,
    signals: [
      { kind: 'host', pattern: /(jobs|careers)\.smartrecruiters\.com$/i, weight: 25 },
      { kind: 'dom', selector: '[data-test="job-application"], spl-job-application, oc-job-application', weight: 45 },
      { kind: 'scriptSrc', pattern: /smartrecruiters\.com/i, weight: 30 },
      { kind: 'iframeSrc', pattern: /smartrecruiters\.com/i, weight: 35 }
    ]
  },

  // --------------------------------------------------------------------------
  // Tier 2: iCIMS
  // --------------------------------------------------------------------------
  {
    id: 'icims',
    name: 'iCIMS',
    threshold: 30,
    signals: [
      { kind: 'host', pattern: /icims\.com$/i, weight: 25 },
      { kind: 'dom', selector: '.iCIMS_JobContent, .iCIMS_JobHeader, iframe[id*="icims"]', weight: 40 },
      { kind: 'iframeSrc', pattern: /icims\.com/i, weight: 35 }
    ]
  },

  // --------------------------------------------------------------------------
  // Tier 2: Workable
  // --------------------------------------------------------------------------
  {
    id: 'workable',
    name: 'Workable',
    threshold: 30,
    signals: [
      { kind: 'host', pattern: /apply\.workable\.com$/i, weight: 25 },
      { kind: 'dom', selector: '[data-ui="application-form"], form[data-ui*="form"]', weight: 45 },
      { kind: 'scriptSrc', pattern: /workable\.com/i, weight: 30 }
    ]
  }
];
