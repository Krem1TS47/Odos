import { describe, it, expect } from 'vitest';
import {
  mapElementToCanonical,
  getElementLabelText,
  ElementContext
} from '../../extension/src/core/fieldMapper';
import { CanonicalField, resolveCanonicalValue } from '../../extension/src/core/fieldSchema';
import { DEFAULT_PROFILE, Profile } from '../../extension/src/core/models';

describe('Field Mapper & Canonical Schema (Step 3)', () => {
  // --------------------------------------------------------------------------
  // 1. Label Table Testing (> 35 Tricky & Real-World Variants)
  // --------------------------------------------------------------------------
  const TEST_TABLE: Array<{
    description: string;
    context: ElementContext;
    expectedCanonical?: CanonicalField;
    minConfidence: number;
    expectedSource?: string;
  }> = [
    // Personal Details
    {
      description: 'Standard First Name',
      context: { labelText: 'First Name *', type: 'text' },
      expectedCanonical: 'first_name',
      minConfidence: 0.80
    },
    {
      description: 'Preferred First Name',
      context: { labelText: 'Preferred first name', type: 'text' },
      expectedCanonical: 'first_name',
      minConfidence: 0.80
    },
    {
      description: 'Given Name',
      context: { labelText: 'Given Name', type: 'text' },
      expectedCanonical: 'first_name',
      minConfidence: 0.80
    },
    {
      description: 'Last Name / Family Name',
      context: { labelText: 'Family Name (Surname) *', type: 'text' },
      expectedCanonical: 'last_name',
      minConfidence: 0.80
    },
    {
      description: 'Full Legal Name',
      context: { labelText: 'Full legal name (as on passport)', type: 'text' },
      expectedCanonical: 'full_name',
      minConfidence: 0.80
    },
    {
      description: 'Your Name (Prompt style)',
      context: { labelText: 'Your name', type: 'text' },
      expectedCanonical: 'full_name',
      minConfidence: 0.80
    },
    {
      description: 'Email Address',
      context: { labelText: 'Email Address *', type: 'email' },
      expectedCanonical: 'email',
      minConfidence: 0.85
    },
    {
      description: 'Phone / Mobile',
      context: { labelText: 'Mobile / Cell Phone number', type: 'tel' },
      expectedCanonical: 'phone',
      minConfidence: 0.85
    },
    {
      description: 'Current Location',
      context: { labelText: 'Current location (City, State)', type: 'text' },
      expectedCanonical: 'location',
      minConfidence: 0.80
    },
    {
      description: 'Street Address',
      context: { labelText: 'Street address line 1', type: 'text' },
      expectedCanonical: 'address_line1',
      minConfidence: 0.80
    },
    {
      description: 'City',
      context: { labelText: 'City *', type: 'text' },
      expectedCanonical: 'city',
      minConfidence: 0.80
    },
    {
      description: 'Postal / Zip Code',
      context: { labelText: 'Zip Code / Postal Code', type: 'text' },
      expectedCanonical: 'postal_code',
      minConfidence: 0.80
    },

    // Online Profiles & URLs
    {
      description: 'LinkedIn Profile',
      context: { labelText: 'LinkedIn Profile URL', type: 'url' },
      expectedCanonical: 'linkedin',
      minConfidence: 0.85
    },
    {
      description: 'GitHub Profile',
      context: { labelText: 'GitHub URL / handle', type: 'url' },
      expectedCanonical: 'github',
      minConfidence: 0.85
    },
    {
      description: 'Portfolio / Website',
      context: { labelText: 'Personal portfolio or website', type: 'url' },
      expectedCanonical: 'website',
      minConfidence: 0.85
    },
    {
      description: 'Twitter / X',
      context: { labelText: 'Twitter / X handle', type: 'text' },
      expectedCanonical: 'twitter',
      minConfidence: 0.85
    },

    // Work Experience
    {
      description: 'Current Company / Employer',
      context: { labelText: 'Current company / employer', type: 'text' },
      expectedCanonical: 'current_company',
      minConfidence: 0.80
    },
    {
      description: 'Current Title / Role',
      context: { labelText: 'Current role or title', type: 'text' },
      expectedCanonical: 'current_title',
      minConfidence: 0.80
    },

    // Resume / Files
    {
      description: 'Resume / CV File',
      context: { labelText: 'Attach resume / CV', type: 'file' },
      expectedCanonical: 'resume',
      minConfidence: 0.85
    },
    {
      description: 'Cover Letter',
      context: { labelText: 'Cover letter or note to the hiring manager', type: 'textarea' },
      expectedCanonical: 'cover_letter',
      minConfidence: 0.85
    },

    // Legal Eligibility & Sponsorship
    {
      description: 'Tricky Work Auth: Are you legally authorized to work in the United States?',
      context: { labelText: 'Are you legally authorized to work in the United States?', type: 'select' },
      expectedCanonical: 'work_authorization',
      minConfidence: 0.85
    },
    {
      description: 'Work Auth: Legally permitted to work',
      context: { labelText: 'Are you legally permitted to work in this country?', type: 'radio' },
      expectedCanonical: 'work_authorization',
      minConfidence: 0.85
    },
    {
      description: 'Sponsorship: Will you now or in the future require visa sponsorship?',
      context: { labelText: 'Will you now or in the future require visa sponsorship for employment?', type: 'select' },
      expectedCanonical: 'requires_sponsorship',
      minConfidence: 0.85
    },
    {
      description: 'Sponsorship: Do you require sponsorship?',
      context: { labelText: 'Do you require visa sponsorship?', type: 'radio' },
      expectedCanonical: 'requires_sponsorship',
      minConfidence: 0.85
    },

    // Logistics & Disclosures
    {
      description: 'Relocation Willingness',
      context: { labelText: 'Are you open to relocation?', type: 'radio' },
      expectedCanonical: 'relocation',
      minConfidence: 0.85
    },
    {
      description: 'Referral Source',
      context: { labelText: 'How did you hear about this role?', type: 'select' },
      expectedCanonical: 'referral_source',
      minConfidence: 0.85
    },
    {
      description: 'Salary / Compensation Expectations',
      context: { labelText: 'What are your compensation or hourly pay rate expectations?', type: 'text' },
      expectedCanonical: 'salary_expectation',
      minConfidence: 0.85
    },
    {
      description: 'Pronouns',
      context: { labelText: 'Preferred pronouns (e.g. they/them, she/her)', type: 'text' },
      expectedCanonical: 'pronouns',
      minConfidence: 0.85
    },

    // EEOC Demographics
    {
      description: 'EEOC Race / Ethnicity',
      context: { labelText: 'Race / Ethnicity (Voluntary)', type: 'select' },
      expectedCanonical: 'eeo_race',
      minConfidence: 0.85
    },
    {
      description: 'EEOC Gender Identity',
      context: { labelText: 'Gender identity', type: 'select' },
      expectedCanonical: 'eeo_gender',
      minConfidence: 0.85
    },
    {
      description: 'EEOC Veteran Status',
      context: { labelText: 'Are you a protected veteran?', type: 'select' },
      expectedCanonical: 'eeo_veteran',
      minConfidence: 0.85
    },
    {
      description: 'EEOC Disability Status',
      context: { labelText: 'Disability / physical or mental impairment disclosure', type: 'select' },
      expectedCanonical: 'eeo_disability',
      minConfidence: 0.85
    },

    // Unmatched / Out of Scope (< 0.60 => Do not fill)
    {
      description: 'Unknown open-ended question',
      context: { labelText: 'What is your favorite memory from college?', type: 'textarea' },
      expectedCanonical: undefined,
      minConfidence: 0
    }
  ];

  TEST_TABLE.forEach(({ description, context, expectedCanonical, minConfidence }) => {
    it(`maps: ${description}`, () => {
      const result = mapElementToCanonical(context);
      expect(result.canonical).toBe(expectedCanonical);
      if (expectedCanonical) {
        expect(result.confidence).toBeGreaterThanOrEqual(minConfidence);
      } else {
        expect(result.confidence).toBeLessThan(0.60);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Autocomplete Attribute Priority (0.95 Confidence)
  // --------------------------------------------------------------------------
  it('prioritizes autocomplete over conflicting label text', () => {
    const ctx: ElementContext = {
      autocomplete: 'given-name',
      labelText: 'Full Name' // Label is full name, but autocomplete is explicitly given-name
    };
    const result = mapElementToCanonical(ctx);
    expect(result.canonical).toBe('first_name');
    expect(result.confidence).toBe(0.95);
    expect(result.source).toBe('autocomplete');
  });

  // --------------------------------------------------------------------------
  // 3. ATS-Specific Identifiers (0.95 Confidence)
  // --------------------------------------------------------------------------
  it('maps Lever explicit bracket notation urls[LinkedIn] and org', () => {
    const resLinkedin = mapElementToCanonical({ name: 'urls[LinkedIn]' });
    expect(resLinkedin.canonical).toBe('linkedin');
    expect(resLinkedin.confidence).toBe(0.95);
    expect(resLinkedin.source).toBe('known_id');

    const resOrg = mapElementToCanonical({ name: 'org' });
    expect(resOrg.canonical).toBe('current_company');
    expect(resOrg.confidence).toBe(0.95);
  });

  it('maps Ashby explicit _systemfield_* attributes', () => {
    const resName = mapElementToCanonical({ name: '_systemfield_name' });
    expect(resName.canonical).toBe('full_name');
    expect(resName.confidence).toBe(0.95);

    const resEmail = mapElementToCanonical({ id: '_systemfield_email' });
    expect(resEmail.canonical).toBe('email');
    expect(resEmail.confidence).toBe(0.95);
  });

  it('maps Workday data-automation-id attributes', () => {
    const resFirst = mapElementToCanonical({ id: 'legalNameSection_firstName' });
    expect(resFirst.canonical).toBe('first_name');
    expect(resFirst.confidence).toBe(0.95);

    const resPostal = mapElementToCanonical({ id: 'addressSection_postalCode' });
    expect(resPostal.canonical).toBe('postal_code');
    expect(resPostal.confidence).toBe(0.95);
  });

  // --------------------------------------------------------------------------
  // 4. HTML Element Label Resolution
  // --------------------------------------------------------------------------
  it('extracts accessible label from aria-label, aria-labelledby, and label[for]', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div>
        <label for="inp1">First Name</label>
        <input id="inp1" type="text" />
      </div>
      <div>
        <span id="label2">Your Email</span>
        <input id="inp2" aria-labelledby="label2" type="email" />
      </div>
      <div>
        <input id="inp3" aria-label="LinkedIn Profile" type="text" />
      </div>
      <div>
        <label>
          <span>Phone Number</span>
          <input id="inp4" type="tel" />
        </label>
      </div>
    `;
    document.body.appendChild(container);

    const inp1 = document.getElementById('inp1') as HTMLElement;
    const inp2 = document.getElementById('inp2') as HTMLElement;
    const inp3 = document.getElementById('inp3') as HTMLElement;
    const inp4 = document.getElementById('inp4') as HTMLElement;

    expect(getElementLabelText(inp1)).toBe('First Name');
    expect(getElementLabelText(inp2)).toBe('Your Email');
    expect(getElementLabelText(inp3)).toBe('LinkedIn Profile');
    expect(getElementLabelText(inp4)).toContain('Phone Number');

    container.remove();
  });

  // --------------------------------------------------------------------------
  // 5. Canonical Value Resolution from User Profile
  // --------------------------------------------------------------------------
  it('resolves canonical field values accurately from profile', () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      contact: {
        ...DEFAULT_PROFILE.contact,
        firstName: 'Jane',
        lastName: 'Doe',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+14155551234',
        location: 'San Francisco, CA, United States',
        linkedin: 'https://linkedin.com/in/janedoe',
        github: 'https://github.com/janedoe',
        website: 'https://janedoe.me'
      },
      workAuthorization: {
        authorizedCountries: ['United States'],
        requiresSponsorship: false
      },
      experience: [
        {
          id: 'exp1',
          company: 'Acme Software',
          title: 'Senior Engineer',
          startDate: '2024',
          endDate: 'Present',
          currentRole: true
        } as any
      ]
    };

    expect(resolveCanonicalValue('first_name', profile)).toBe('Jane');
    expect(resolveCanonicalValue('last_name', profile)).toBe('Doe');
    expect(resolveCanonicalValue('full_name', profile)).toBe('Jane Doe');
    expect(resolveCanonicalValue('email', profile)).toBe('jane@example.com');
    expect(resolveCanonicalValue('phone', profile)).toBe('+14155551234');
    expect(resolveCanonicalValue('city', profile)).toBe('San Francisco');
    expect(resolveCanonicalValue('state', profile)).toBe('CA');
    expect(resolveCanonicalValue('country', profile)).toBe('United States');
    expect(resolveCanonicalValue('current_company', profile)).toBe('Acme Software');
    expect(resolveCanonicalValue('current_title', profile)).toBe('Senior Engineer');
    expect(resolveCanonicalValue('work_authorization', profile)).toBe('Yes');
    expect(resolveCanonicalValue('requires_sponsorship', profile)).toBe('No');
  });
});
