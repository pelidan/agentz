// === Status types ===
export const TASK_STATUSES = ["completed", "failed", "needs_input"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// === Recommendation types ===
export const RECOMMENDATION_TYPES = [
  "ADD_TODO",
  "ADD_NOTE",
  "NEEDS_REVIEW",
  "ADD_GLOBAL_NOTE",
] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const PRIORITY_LEVELS = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITY_LEVELS)[number];

export interface Recommendation {
  type: RecommendationType;
  description: string;
  priority?: Priority; // Only for ADD_TODO
  category?: string; // For ADD_TODO (task category) or ADD_GLOBAL_NOTE (knowledge category)
}

// === Completion Report (returned to orchestrator) ===
export interface CompletionReport {
  status: TaskStatus;
  outputPath: string;
  summary: string; // 2-5 sentences, hard limit
  recommendations: Recommendation[];
  questions?: string[]; // Only when status === "needs_input"
  // Failure-specific fields (only when status === "failed")
  errorType?: "transient" | "capability" | "systematic";
  errorDetail?: string;
  attempts?: number;
  tiersTried?: string[];
}

// === Output File Sections ===
export const OUTPUT_SECTIONS = [
  "Summary",
  "Details",
  "Artifacts",
  "Recommendations",
] as const;
export type OutputSection = (typeof OUTPUT_SECTIONS)[number];

export interface OutputFile {
  summary: string; // 2-5 sentences, self-contained
  details: string;
  artifacts: string[];
  recommendations: Recommendation[];
}

// === Parser Result Types ===
export interface ParseResult {
  found: boolean; // Was a completion report detected at all?
  raw: string; // Extracted report text (preamble/fences stripped)
  fields: Partial<CompletionReport>; // Best-effort field extraction
}

export interface OutputFileParseResult {
  valid: boolean;
  sections: Partial<Record<OutputSection, string>>;
  errors: ValidationError[];
}

// === Validation Result Types ===
export interface ValidationError {
  field: string; // "status", "summary", "outputPath", etc.
  error: string; // Human-readable description
}

export interface ValidationResult {
  valid: boolean;
  report?: CompletionReport; // Structured data (when valid)
  errors: ValidationError[]; // What failed (when invalid)
}

// === Protocol Constraints (used by both renderer and validator) ===
export const PROTOCOL_CONSTRAINTS = {
  summary: {
    minSentences: 2,
    maxSentences: 5,
    validationMaxSentences: 10, // Generous threshold for binary validation
    requirement:
      "self-contained, understandable without the rest of the file",
  },
  outputFile: {
    firstSection: "Summary" as const,
    sections: OUTPUT_SECTIONS,
  },
  notes: {
    guidance: "durable insights and constraints, not status updates",
    goodExamples: [
      "User prefers PostgreSQL over MySQL",
      "Auth system uses JWT with RS256 signing",
      "CI pipeline requires Node 20+",
      "The payments module has no test coverage — handle carefully",
    ],
    badExamples: [
      "Started working on API endpoints",
      "Database schema completed successfully",
      "Dispatched frontend developer",
    ],
  },
  globalNotes: {
    guidance:
      "durable project-level facts that persist across sessions — tech stack, team preferences, architectural decisions, known constraints",
    injectionCap: 400, // max tokens for global notes injection into child agent context
    staleSessions: 5, // sessions without re-confirmation before [stale] marker
    goodExamples: [
      "Project uses PostgreSQL 15 with pgvector extension",
      "Team convention: all API responses wrapped in { data, error } envelope",
      "Auth uses JWT with RS256, keys rotated monthly via AWS Secrets Manager",
      "The legacy billing module is untested — changes require manual QA sign-off",
    ],
    badExamples: [
      "Completed the auth refactor",
      "User wants dark mode", // too session-specific, not a durable project fact
      "Fixed the bug in payments",
    ],
  },
} as const;
