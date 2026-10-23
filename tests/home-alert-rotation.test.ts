import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canRotateHomeAlerts,
  nextHomeAlertIndex,
  startHomeAlertRotation,
} from "../src/lib/home-alert-rotation";

test("two-card automatic rotation wraps back to the first even without a carousel loop", () => {
  let index = 0,
    delay = 0,
    cancelled = false;
  let tick = () => {};
  const visited: number[] = [];
  const stop = startHomeAlertRotation(
    {
      selectedScrollSnap: () => index,
      scrollSnapList: () => [0, 1],
      scrollTo: (next) => {
        index = next;
        visited.push(next);
      },
    },
    8,
    false,
    (callback, milliseconds) => {
      tick = callback;
      delay = milliseconds;
      return () => {
        cancelled = true;
      };
    },
  );
  tick();
  tick();
  tick();
  tick();
  assert.deepEqual(visited, [1, 0, 1, 0]);
  assert.equal(delay, 8000);
  stop();
  assert.equal(cancelled, true);
});
test("automatic content changes still run with reduced motion, using an instant switch", () => {
  let tick = () => {};
  const calls: Array<[number, boolean | undefined]> = [];
  startHomeAlertRotation(
    {
      selectedScrollSnap: () => 0,
      scrollSnapList: () => [0, 1, 2],
      scrollTo: (index, jump) => calls.push([index, jump]),
    },
    5,
    true,
    (callback, delay) => {
      assert.equal(delay, 5000);
      tick = callback;
      return () => {};
    },
  );
  tick();
  assert.deepEqual(calls, [[1, true]]);
});
test("manual navigation wraps in both directions and safely handles one or no cards", () => {
  assert.equal(nextHomeAlertIndex(0, 3, -1), 2);
  assert.equal(nextHomeAlertIndex(2, 3), 0);
  assert.equal(nextHomeAlertIndex(0, 1), 0);
  assert.equal(nextHomeAlertIndex(0, 0), 0);
});
test("automatic mode pauses only for explicit pause, keyboard, dragging, confirmation or hidden page", () => {
  const ready = {
    automatic: true,
    count: 2,
    paused: false,
    keyboardFocused: false,
    dragging: false,
    confirming: false,
    pageVisible: true,
  };
  assert.equal(canRotateHomeAlerts(ready), true);
  for (const patch of [
    { automatic: false },
    { count: 1 },
    { paused: true },
    { keyboardFocused: true },
    { dragging: true },
    { confirming: true },
    { pageVisible: false },
  ])
    assert.equal(canRotateHomeAlerts({ ...ready, ...patch }), false);
  assert.equal(canRotateHomeAlerts({ ...ready, keyboardFocused: false }), true);
});
test("an empty or single-card carousel does not receive automatic scroll requests", () => {
  for (const snaps of [[], [0]]) {
    let tick = () => {},
      calls = 0;
    startHomeAlertRotation(
      {
        selectedScrollSnap: () => 0,
        scrollSnapList: () => snaps,
        scrollTo: () => calls++,
      },
      12,
      false,
      (callback) => {
        tick = callback;
        return () => {};
      },
    );
    tick();
    assert.equal(calls, 0);
  }
});
