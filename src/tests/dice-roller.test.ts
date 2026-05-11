import { describe, expect, it } from "vitest";
import { parseDiceExpression, rollDiceExpression } from "../features/dice";

describe("dice roller", () => {
  it("parses mixed dice and constant expressions", () => {
    const parsed = parseDiceExpression("2d6 + 1d4 - 3");
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ kind: "dice", sign: 1, count: 2, sides: 6 });
    expect(parsed[1]).toMatchObject({ kind: "dice", sign: 1, count: 1, sides: 4 });
    expect(parsed[2]).toMatchObject({ kind: "constant", sign: -1, value: 3 });
  });

  it("rolls deterministically with injected rng", () => {
    const values = [0.0, 0.5, 0.99, 0.1];
    let index = 0;
    const rng = () => {
      const current = values[index] ?? 0.0;
      index += 1;
      return current;
    };
    const result = rollDiceExpression("2d6+1d4+2", rng);
    expect(result.terms[0].rolls).toEqual([1, 4]);
    expect(result.terms[1].rolls).toEqual([4]);
    expect(result.total).toBe(11);
  });
});
