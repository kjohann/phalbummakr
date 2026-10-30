import { describe, expect, it } from "vitest";
import { domainCoreName } from "./index";

describe("domain core", () => {
  it("exposes its public entry point", () => {
    expect(domainCoreName).toBe("phalbummakr");
  });
});