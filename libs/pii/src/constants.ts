/**
 * Shared PII type constants for cross-platform consistency.
 * Use these constants instead of string literals to ensure
 * consistent naming across iOS, Android, and TypeScript.
 */

/**
 * Normalized PII entity type names.
 * All platforms should use these exact strings.
 */
export const PIITypes = {
  // Named entities
  PERSON: 'person',
  ORGANIZATION: 'organization',
  LOCATION: 'location',

  // Contact information
  EMAIL_ADDRESS: 'email_address',
  PHONE_NUMBER: 'phone_number',
  ADDRESS: 'address',

  // Government IDs
  US_SSN: 'us_ssn',
  US_PASSPORT: 'us_passport',
  US_DRIVER_LICENSE: 'us_driver_license',
  US_ITIN: 'us_itin',
  US_LICENSE_PLATE: 'us_license_plate',
  US_BANK_NUMBER: 'us_bank_number',

  // Financial
  CREDIT_CARD: 'credit_card',
  IBAN_CODE: 'iban_code',
  FINANCIAL: 'financial',

  // Technical identifiers
  IP_ADDRESS: 'ip_address',
  MAC_ADDRESS: 'mac_address',
  URL: 'url',
  IMEI: 'imei',
  PASSWORD: 'password',

  // Other
  AGE: 'age',
  COORDINATE: 'coordinate',
  DATE_TIME: 'date_time',
  NRP: 'nrp', // National Registration/ID number
  TITLE: 'title',

  // Custom patterns
  CUSTOM: 'custom',
} as const;

export type PIITypeName = (typeof PIITypes)[keyof typeof PIITypes];

/**
 * Default enabled PII types for detection.
 */
export const DEFAULT_ENABLED_TYPES: PIITypeName[] = [
  PIITypes.PERSON,
  PIITypes.ORGANIZATION,
  PIITypes.LOCATION,
  PIITypes.EMAIL_ADDRESS,
  PIITypes.PHONE_NUMBER,
  PIITypes.US_SSN,
  PIITypes.CREDIT_CARD,
];

/**
 * PII types that require ML model for accurate detection.
 * These should not be detected using heuristics alone.
 */
export const ML_REQUIRED_TYPES: PIITypeName[] = [
  PIITypes.PERSON,
  PIITypes.ORGANIZATION,
  PIITypes.LOCATION,
  PIITypes.AGE,
  PIITypes.DATE_TIME,
  PIITypes.TITLE,
  PIITypes.NRP,
];

/**
 * PII types that can be detected with regex patterns.
 */
export const REGEX_DETECTABLE_TYPES: PIITypeName[] = [
  PIITypes.EMAIL_ADDRESS,
  PIITypes.PHONE_NUMBER,
  PIITypes.US_SSN,
  PIITypes.CREDIT_CARD,
  PIITypes.IP_ADDRESS,
  PIITypes.MAC_ADDRESS,
  PIITypes.URL,
  PIITypes.IBAN_CODE,
  PIITypes.COORDINATE,
];

/**
 * Model ID for the PII detection BERT model.
 */
export const PII_MODEL_ID = 'bert-small-pii';
