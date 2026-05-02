import { describe, expect, it } from "vitest";
import { resolveCanonicalClassKey } from "../services/data/resolvers/classResolver";

describe("class resolver", () => {
  it("maps Open5e and local aliases to canonical class keys", () => {
    expect(resolveCanonicalClassKey({ key: "srd-2024_wizard" })).toBe("wizard");
    expect(resolveCanonicalClassKey({ key: "srd_fighter" })).toBe("fighter");
    expect(resolveCanonicalClassKey({ key: "clericua" })).toBe("cleric");
    expect(resolveCanonicalClassKey({ key: "ranger", name: "Ranger" })).toBe("ranger");
  });
});
