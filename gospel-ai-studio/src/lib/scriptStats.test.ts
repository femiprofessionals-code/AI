import { describe, expect, it } from "vitest";
import { countWords, scriptStats, speakerLine } from "./scriptStats";

describe("speakerLine", () => {
  it("detects speaker lines like the Rust parser", () => {
    expect(speakerLine("PASTOR JAMES: Grace is free")).toEqual({ name: "PASTOR JAMES", text: "Grace is free" });
    expect(speakerLine("10:30 is the time")).toBeNull();
    expect(speakerLine("John 3:16 says")).toBeNull();
    expect(speakerLine("https://example.org")).toBeNull();
    expect(speakerLine("this is a very long sentence that: has a colon")).toBeNull();
  });
});

describe("scriptStats", () => {
  it("counts conversation beats and speakers", () => {
    const s = scriptStats("# Intro\n(wide)\nA: one two\nmore words\n\nB: three\n\nA: four", "conversation", 60);
    expect(s.beats).toBe(3);
    expect(s.speakers).toEqual([
      { name: "A", lines: 2, words: 5 },
      { name: "B", lines: 1, words: 1 },
    ]);
    expect(s.estimatedMs).toBe(6000);
  });

  it("counts every hypeman line as a beat", () => {
    const s = scriptStats("Are you ready?\n(drop)\nSay amen!", "hypeman", 120);
    expect(s.beats).toBe(2);
    expect(countWords("Say amen!")).toBe(2);
  });
});
