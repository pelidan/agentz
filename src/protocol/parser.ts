import {
  RECOMMENDATION_TYPES,
  PRIORITY_LEVELS,
  OUTPUT_SECTIONS,
  type ParseResult,
  type OutputFileParseResult,
  type CompletionReport,
  type Recommendation,
  type RecommendationType,
  type Priority,
  type OutputSection,
  type ValidationError,
} from "./types";

const FIELD_PREFIXES = [
  "STATUS:",
  "OUTPUT:",
  "SUMMARY:",
  "RECOMMENDATIONS:",
  "QUESTIONS:",
] as const;

/**
 * Extracts structured fields from freeform agent output.
 * Scans for STATUS: as the anchor — everything from that line onward is the report.
 */
export function parseCompletionReport(raw: string): ParseResult {
  // Strip code fences
  const stripped = raw.replace(/```[\s\S]*?```/g, (match) => {
    // Keep the content inside fences, strip the fence markers
    return match.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
  });

  // Find STATUS: anchor
  const lines = stripped.split("\n");
  const statusLineIdx = lines.findIndex((l) =>
    l.trim().startsWith("STATUS:")
  );

  if (statusLineIdx === -1) {
    return { found: false, raw: "", fields: {} };
  }

  // Extract from STATUS line onward
  const reportLines = lines.slice(statusLineIdx);
  const reportRaw = reportLines.join("\n").trim();

  // Parse fields
  const fields: Partial<CompletionReport> = {};

  // Extract single-line fields
  const statusMatch = reportRaw.match(/^STATUS:\s*(.+)$/m);
  if (statusMatch) {
    fields.status = statusMatch[1].trim() as CompletionReport["status"];
  }

  const outputMatch = reportRaw.match(/^OUTPUT:\s*(.+)$/m);
  if (outputMatch) {
    fields.outputPath = outputMatch[1].trim();
  }

  // Extract multi-line fields (consume until next prefix or end)
  fields.summary = extractMultiLineField(reportLines, "SUMMARY:");
  fields.recommendations = parseRecommendations(
    extractMultiLineField(reportLines, "RECOMMENDATIONS:")
  );

  const questionsRaw = extractMultiLineField(reportLines, "QUESTIONS:");
  if (questionsRaw) {
    fields.questions = questionsRaw
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter((l) => l.length > 0);
  }

  return { found: true, raw: reportRaw, fields };
}

/**
 * Extracts a multi-line field value from report lines.
 * Consumes from the prefix line until the next recognized prefix or end-of-text.
 */
function extractMultiLineField(
  lines: string[],
  prefix: string
): string {
  const startIdx = lines.findIndex((l) => l.trim().startsWith(prefix));
  if (startIdx === -1) return "";

  // Get the remainder of the first line after the prefix
  const firstLine = lines[startIdx].trim().slice(prefix.length).trim();
  const contentLines: string[] = firstLine ? [firstLine] : [];

  // Consume subsequent lines until next prefix or end
  for (let i = startIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (FIELD_PREFIXES.some((p) => trimmed.startsWith(p))) {
      break;
    }
    contentLines.push(lines[i]);
  }

  return contentLines
    .join("\n")
    .trim();
}

/**
 * Parses recommendation lines into structured objects.
 * Format: - TYPE: description [priority: X] [category: Y]
 */
function parseRecommendations(raw: string): Recommendation[] {
  if (!raw) return [];

  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0);

  const recommendations: Recommendation[] = [];

  for (const line of lines) {
    // Match TYPE: description [priority: X] [category: Y]
    const typeMatch = line.match(
      new RegExp(`^(${RECOMMENDATION_TYPES.join("|")}):\\s*(.+)$`)
    );
    if (!typeMatch) continue;

    const type = typeMatch[1] as RecommendationType;
    let description = typeMatch[2].trim();
    let priority: Priority | undefined;
    let category: string | undefined;

    // Extract [priority: X]
    const priorityMatch = description.match(
      new RegExp(`\\[priority:\\s*(${PRIORITY_LEVELS.join("|")})\\]`)
    );
    if (priorityMatch) {
      priority = priorityMatch[1] as Priority;
      description = description.replace(priorityMatch[0], "").trim();
    }

    // Extract [category: X]
    const categoryMatch = description.match(/\[category:\s*([^\]]+)\]/);
    if (categoryMatch) {
      category = categoryMatch[1].trim();
      description = description.replace(categoryMatch[0], "").trim();
    }

    recommendations.push({ type, description, priority, category });
  }

  return recommendations;
}

/**
 * Splits a markdown output file by ## headings and validates section structure.
 */
export function parseOutputFile(content: string): OutputFileParseResult {
  const errors: ValidationError[] = [];
  const sections: Partial<Record<OutputSection, string>> = {};

  // Split by ## headings
  const headingRegex = /^## (.+)$/gm;
  const headings: { name: string; start: number; end?: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(content)) !== null) {
    if (headings.length > 0) {
      headings[headings.length - 1].end = match.index;
    }
    headings.push({ name: match[1].trim(), start: match.index + match[0].length });
  }
  if (headings.length > 0) {
    headings[headings.length - 1].end = content.length;
  }

  // Map known sections
  for (const heading of headings) {
    const sectionName = OUTPUT_SECTIONS.find(
      (s) => s.toLowerCase() === heading.name.toLowerCase()
    );
    if (sectionName) {
      sections[sectionName] = content
        .slice(heading.start, heading.end)
        .trim();
    }
  }

  // Validate: Summary must exist
  if (!sections.Summary) {
    errors.push({ field: "Summary", error: "Missing required ## Summary section" });
  }

  // Validate: Summary must be first heading
  if (headings.length > 0 && headings[0].name.toLowerCase() !== "summary") {
    errors.push({
      field: "Summary",
      error: "## Summary must be the first section in the output file",
    });
  }

  // Validate: all required sections present
  for (const section of OUTPUT_SECTIONS) {
    if (section === "Summary") continue; // already checked
    if (!sections[section]) {
      errors.push({
        field: section,
        error: `Missing required ## ${section} section`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    sections,
    errors,
  };
}
