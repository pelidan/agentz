import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TIER_CONFIG,
  CATEGORY_MAPPING,
  getTierForCategory,
  getSkillForCategory,
  getEscalationTier,
  type TierConfig,
  type CategoryMapping,
} from "./config";

describe("tier configuration", () => {
  test("DEFAULT_TIER_CONFIG has 4 tiers", () => {
    expect(Object.keys(DEFAULT_TIER_CONFIG)).toHaveLength(4);
    expect(DEFAULT_TIER_CONFIG["fast-cheap"]).toBeDefined();
    expect(DEFAULT_TIER_CONFIG["balanced"]).toBeDefined();
    expect(DEFAULT_TIER_CONFIG["powerful"]).toBeDefined();
    expect(DEFAULT_TIER_CONFIG["reasoning"]).toBeDefined();
  });

  test("each tier has model and escalate_to", () => {
    for (const [name, tier] of Object.entries(DEFAULT_TIER_CONFIG)) {
      expect(tier.model).toBeDefined();
      expect("escalate_to" in tier).toBe(true);
    }
  });

  test("escalation chain is finite", () => {
    let tier = DEFAULT_TIER_CONFIG["fast-cheap"];
    const visited = new Set<string>();
    while (tier.escalate_to) {
      expect(visited.has(tier.escalate_to)).toBe(false); // no cycles
      visited.add(tier.escalate_to);
      tier = DEFAULT_TIER_CONFIG[tier.escalate_to];
    }
  });
});

describe("category mapping", () => {
  test("CATEGORY_MAPPING has 16 categories", () => {
    expect(Object.keys(CATEGORY_MAPPING)).toHaveLength(16);
  });

  test("each category has tier and skill", () => {
    for (const [name, mapping] of Object.entries(CATEGORY_MAPPING)) {
      expect(mapping.tier).toBeDefined();
      expect(mapping.skill).toBeDefined();
      expect(DEFAULT_TIER_CONFIG[mapping.tier]).toBeDefined();
    }
  });

  test("getTierForCategory returns correct tier", () => {
    expect(getTierForCategory("explore-local")).toBe("fast-cheap");
    expect(getTierForCategory("develop-backend")).toBe("balanced");
    expect(getTierForCategory("architect-db")).toBe("powerful");
  });

  test("getTierForCategory returns balanced for unknown", () => {
    expect(getTierForCategory("unknown-category")).toBe("balanced");
  });

  test("getSkillForCategory returns correct skill", () => {
    expect(getSkillForCategory("explore-local")).toBe("local-explorer");
    expect(getSkillForCategory("develop-backend")).toBe("backend-developer");
    expect(getSkillForCategory("synthesize")).toBe("synthesizer");
  });

  test("getSkillForCategory returns category name for unknown", () => {
    expect(getSkillForCategory("unknown-category")).toBe("unknown-category");
  });

  test("getEscalationTier follows chain", () => {
    expect(getEscalationTier("fast-cheap")).toBe("balanced");
    expect(getEscalationTier("balanced")).toBe("powerful");
    expect(getEscalationTier("powerful")).toBeNull();
    expect(getEscalationTier("reasoning")).toBeNull();
  });
});
