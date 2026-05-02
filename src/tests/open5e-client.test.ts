import { afterEach, describe, expect, it, vi } from "vitest";
import { Open5eClient } from "../services/data/open5e/client";

describe("open5e client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads paginated results across multiple pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            count: 3,
            next: "https://api.open5e.com/v2/classes/?page=2&limit=2",
            previous: null,
            results: [{ key: "a" }, { key: "b" }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            count: 3,
            next: null,
            previous: "https://api.open5e.com/v2/classes/?page=1&limit=2",
            results: [{ key: "c" }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new Open5eClient();
    const result = await client.fetchAllPages<{ key: string }>("classes", { document__key__in: "srd-2024" }, { pauseMs: 0 });

    expect(result.count).toBe(3);
    expect(result.entries.map((entry) => entry.key)).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
