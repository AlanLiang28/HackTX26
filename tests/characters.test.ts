import assert from "node:assert/strict";
import { test } from "node:test";
import { getCharacter } from "../src/lib/characters.ts";
import { getDemoSession } from "../src/lib/study.ts";
import { ENCOUNTERS_BEFORE_BOSS } from "../game-routes.ts";

for (const theme of ["fantasy", "sports"] as const) {
  test(`${theme} has four distinct characters across study encounters and the final boss`, () => {
    const demoCount = getDemoSession(theme).content.quiz.length;
    assert.equal(ENCOUNTERS_BEFORE_BOSS, 3);
    assert.equal(demoCount, ENCOUNTERS_BEFORE_BOSS);
    const encounters = Array.from({ length: ENCOUNTERS_BEFORE_BOSS }, (_, index) =>
      getCharacter(theme, index),
    );
    const boss = getCharacter(theme, encounters.length, true);
    const cast = [...encounters, boss];
    assert.equal(cast.length, 4);
    assert.equal(new Set(cast.map((character) => character.name)).size, 4);
    assert.equal(new Set(cast.map((character) => character.sprite)).size, 4);
    assert.equal(new Set(cast.map((character) => character.introduction)).size, 4);
    assert.equal(boss.name, theme === "fantasy" ? "Professor Ember" : "Coach Stone");
    assert.equal(getCharacter(theme, 3, true), boss);
    assert.equal(getCharacter(theme, 0, true), boss);
  });
}
