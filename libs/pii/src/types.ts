/**
 * PII Entity types supported by the bert-small-pii model
 * Source: https://huggingface.co/gravitee-io/bert-small-pii-detection
 */
export type PIIEntityType =
  | 'age'
  | 'coordinate'
  | 'credit_card'
  | 'date_time'
  | 'email_address'
  | 'financial'
  | 'iban_code'
  | 'imei'
  | 'ip_address'
  | 'location'
  | 'mac_address'
  | 'nrp'
  | 'organization'
  | 'password'
  | 'person'
  | 'phone_number'
  | 'title'
  | 'url'
  | 'us_bank_number'
  | 'us_driver_license'
  | 'us_itin'
  | 'us_license_plate'
  | 'us_passport'
  | 'us_ssn'
  | 'ssn'
  | 'address'
  | 'email'
  | 'phone'
  | 'custom';

export interface PIIEntity {
  type: PIIEntityType;
  text: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface RedactionResult {
  originalText: string;
  redactedText: string;
  entities: PIIEntity[];
  processingTimeMs: number;
}

export interface PIIConfig {
  enabledTypes?: PIIEntityType[];
  customPatterns?: CustomPattern[];
  redactionChar?: string;
  minConfidence?: number;
  preserveLength?: boolean;
}

export interface CustomPattern {
  name: string;
  pattern: string;
  type: PIIEntityType;
}

export interface PIIStats {
  totalScanned: number;
  totalRedacted: number;
  byType: Record<PIIEntityType, number>;
  averageProcessingTimeMs: number;
}
