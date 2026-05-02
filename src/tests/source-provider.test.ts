import { describe, expect, it } from "vitest";
import { resolveSourceProvider, sourceKeysForProvider } from "../services/data/sourceProvider";

describe("source provider resolver", () => {
  it("classifies open5e and mpmb source keys consistently", () => {
    expect(resolveSourceProvider({ key: "srd-2024", group: "Open5e 2024" })).toBe("open5e");
    expect(resolveSourceProvider({ key: "open5e", group: "Open5e 2014" })).toBe("open5e");
    expect(resolveSourceProvider({ key: "mpmbpdf-srd", group: "MPMB PDF Core" })).toBe("mpmb");
    expect(resolveSourceProvider({ key: "X", group: "Primary Sources" })).toBe("mpmb");
  });

  it("returns source keys for provider selections", () => {
    const sources = [
      { key: "srd-2014", group: "Open5e 2014" },
      { key: "srd-2024", group: "Open5e 2024" },
      { key: "PHB", group: "Primary Sources" },
      { key: "mpmbpdf-srd", group: "MPMB PDF Core" },
    ];

    expect(sourceKeysForProvider(sources, "open5e")).toEqual(["srd-2014", "srd-2024"]);
    expect(sourceKeysForProvider(sources, "mpmb")).toEqual(["PHB", "mpmbpdf-srd"]);
    expect(sourceKeysForProvider(sources, "all")).toEqual(["srd-2014", "srd-2024", "PHB", "mpmbpdf-srd"]);
  });
});
