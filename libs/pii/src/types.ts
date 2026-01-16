export type PIIEntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'date'
  | 'address'
  | 'ip_address'
  | 'url'
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
