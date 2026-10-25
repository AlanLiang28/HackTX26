import assert from "node:assert/strict";
import { test } from "node:test";
import { readStudyFile } from "../src/lib/material.ts";

test("study uploads preserve TXT and Markdown content for class material", async () => {
  for (const filename of ["lesson.txt", "lesson.MD"]) {
    const content = "# Cells\n\nThe nucleus stores DNA.\n";
    assert.equal(await readStudyFile(new File([content], filename)), content);
  }
});

test("study uploads reject unsupported, empty, and oversized material", async () => {
  await assert.rejects(
    readStudyFile(new File(["PDF bytes"], "lesson.pdf")),
    /Choose a TXT or Markdown file/,
  );
  await assert.rejects(
    readStudyFile(new File([" \n\t"], "empty.txt")),
    /That file is empty/,
  );
  await assert.rejects(
    readStudyFile(new File(["a".repeat(1024 * 1024 + 1)], "large.txt")),
    /under 1 MB/,
  );
  await assert.rejects(
    readStudyFile(new File(["a".repeat(20001)], "long.md")),
    /up to 20,000 characters/,
  );
  const atLimit = "a".repeat(20000);
  assert.equal(await readStudyFile(new File([atLimit], "limit.txt")), atLimit);
});

test("study uploads report a file read failure without accepting its content", async () => {
  const file = new File(["Notes"], "lesson.txt");
  file.text = async () => {
    throw new Error("Could not read file");
  };
  await assert.rejects(readStudyFile(file), /Could not read file/);
});
