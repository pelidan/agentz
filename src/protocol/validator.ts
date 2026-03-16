import { existsSync, readFileSync } from "fs";
import {
  TASK_STATUSES,
  PROTOCOL_CONSTRAINTS,
  type CompletionReport,
  type ValidationResult,
  type ValidationError,
} from "./types";
import { parseCompletionReport, parseOutputFile } from "./parser";

/**
 * Counts sentences in text using a simple heuristic:
 * split on period/exclamation/question followed by space or end-of-string.
 */
function countSentences(text: string): number {
  const sentences = text
    .split(/[.!?]+(?:\s|$)/)
    .filter((s) => s.trim().length > 0);
  return sentences.length;
}

/**
 * Validates a raw agent response containing a completion report.
 * Binary pass/fail — all checks must pass.
 * Runs inside agentz_dispatch after parsing, before the result reaches the orchestrator.
 */
export function validateCompletionReport(raw: string): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Parse the report
  const parsed = parseCompletionReport(raw);

  if (!parsed.found) {
    return {
      valid: false,
      errors: [
        {
          field: "report",
          error: "No completion report detected in response (missing STATUS: line)",
        },
      ],
    };
  }

  const { fields } = parsed;

  // 2. STATUS present and valid
  if (!fields.status || !fields.status.trim()) {
    errors.push({ field: "status", error: "STATUS field is empty" });
  } else if (
    !TASK_STATUSES.includes(fields.status as (typeof TASK_STATUSES)[number])
  ) {
    errors.push({
      field: "status",
      error: `Invalid STATUS value: "${fields.status}". Must be one of: ${TASK_STATUSES.join(", ")}`,
    });
  }

  // 3. OUTPUT path present and plausible
  // Guard: parser regex may bleed into next field when OUTPUT: is empty
  const FIELD_PREFIXES = ["STATUS:", "OUTPUT:", "SUMMARY:", "RECOMMENDATIONS:", "QUESTIONS:"];
  const outputPathRaw = fields.outputPath?.trim();
  const outputPathIsFieldBleed = outputPathRaw
    ? FIELD_PREFIXES.some((p) => outputPathRaw.startsWith(p))
    : false;

  if (!outputPathRaw || outputPathIsFieldBleed) {
    errors.push({ field: "outputPath", error: "OUTPUT path is empty" });
  } else {
    // 4. Output file exists on disk
    if (!existsSync(outputPathRaw)) {
      errors.push({
        field: "outputFile",
        error: `Output file does not exist: ${outputPathRaw}`,
      });
    } else {
      // 5-8. Validate output file structure
      const content = readFileSync(outputPathRaw, "utf-8");
      const outputResult = parseOutputFile(content);
      if (!outputResult.valid) {
        for (const err of outputResult.errors) {
          errors.push({
            field: `outputFile.${err.field}`,
            error: err.error,
          });
        }
      }
    }
  }

  // 9. SUMMARY present
  if (!fields.summary || !fields.summary.trim()) {
    errors.push({ field: "summary", error: "SUMMARY is empty" });
  } else {
    // 10. SUMMARY reasonable length
    const sentenceCount = countSentences(fields.summary);
    if (sentenceCount > PROTOCOL_CONSTRAINTS.summary.validationMaxSentences) {
      errors.push({
        field: "summary",
        error: `SUMMARY has ${sentenceCount} sentences (max ${PROTOCOL_CONSTRAINTS.summary.validationMaxSentences}). This looks like a full dump, not a summary.`,
      });
    }
  }

  // 11. QUESTIONS present when needs_input
  if (fields.status === "needs_input") {
    if (!fields.questions || fields.questions.length === 0) {
      errors.push({
        field: "questions",
        error:
          'STATUS is "needs_input" but no QUESTIONS provided',
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build the validated report
  const report: CompletionReport = {
    status: fields.status!,
    outputPath: fields.outputPath!,
    summary: fields.summary!,
    recommendations: fields.recommendations ?? [],
    questions: fields.questions,
  };

  return { valid: true, report, errors: [] };
}
