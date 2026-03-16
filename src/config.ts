export interface TierDef {
  model: string;
  escalate_to: string | null;
}

export type TierConfig = Record<string, TierDef>;

export interface CategoryMappingEntry {
  tier: string;
  skill: string;
}

export type CategoryMapping = Record<string, CategoryMappingEntry>;

export const DEFAULT_TIER_CONFIG: TierConfig = {
  "fast-cheap": { model: "haiku", escalate_to: "balanced" },
  balanced: { model: "sonnet", escalate_to: "powerful" },
  powerful: { model: "opus", escalate_to: null },
  reasoning: { model: "o3", escalate_to: null },
};

export const CATEGORY_MAPPING: CategoryMapping = {
  "explore-local": { tier: "fast-cheap", skill: "local-explorer" },
  "explore-web": { tier: "fast-cheap", skill: "web-explorer" },
  "analyze-business": { tier: "balanced", skill: "business-analyst" },
  "analyze-technical": { tier: "balanced", skill: "technical-analyst" },
  "develop-backend": { tier: "balanced", skill: "backend-developer" },
  "develop-frontend": { tier: "balanced", skill: "frontend-developer" },
  "design-ui": { tier: "balanced", skill: "ui-ux-designer" },
  "test-backend": { tier: "balanced", skill: "backend-tester" },
  "test-frontend": { tier: "balanced", skill: "frontend-tester" },
  "review-code": { tier: "balanced", skill: "code-reviewer" },
  "architect-db": { tier: "powerful", skill: "database-architect" },
  "engineer-devops": { tier: "balanced", skill: "devops-engineer" },
  "audit-security": { tier: "powerful", skill: "security-auditor" },
  "write-docs": { tier: "balanced", skill: "technical-writer" },
  synthesize: { tier: "balanced", skill: "synthesizer" },
  verify: { tier: "balanced", skill: "backend-tester" },
};

export function getTierForCategory(category: string): string {
  return CATEGORY_MAPPING[category]?.tier ?? "balanced";
}

export function getSkillForCategory(category: string): string {
  return CATEGORY_MAPPING[category]?.skill ?? category;
}

export function getEscalationTier(
  currentTier: string,
  config: TierConfig = DEFAULT_TIER_CONFIG,
): string | null {
  return config[currentTier]?.escalate_to ?? null;
}
