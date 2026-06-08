import { describe, expect, it } from "vitest";
import { bytesToHuman, secondsToHMS } from "./utils";

describe("bytesToHuman", () => {
  it("formats small values in bytes", () => {
    expect(bytesToHuman(900)).toBe("900 B");
  });
  it("formats MB and GB", () => {
    expect(bytesToHuman(1024 * 1024)).toBe("1.0 MB");
    expect(bytesToHuman(1024 * 1024 * 1024 * 3.5)).toBe("3.5 GB");
  });
});

describe("secondsToHMS", () => {
  it("formats minutes:seconds", () => {
    expect(secondsToHMS(65)).toBe("1:05");
  });
  it("formats hours when present", () => {
    expect(secondsToHMS(3661)).toBe("1:01:01");
  });
  it("guards against bad input", () => {
    expect(secondsToHMS(-1)).toBe("0:00");
    expect(secondsToHMS(Number.NaN)).toBe("0:00");
  });
});
