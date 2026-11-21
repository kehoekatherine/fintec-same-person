import assert from "node:assert/strict";
import test from "node:test";

import { findDevPack, publishedHost } from "./data-pack.ts";
import { contentLengthRejection } from "./upload-file.ts";
import { acquirePython } from "./python-slot.ts";

test("a local run is not the published host and can see a pack path", async () => {
  const previous = process.env.CURSOR_APP_ID;
  delete process.env.CURSOR_APP_ID;
  assert.equal(publishedHost(), false);
  const pack = await findDevPack();
  assert.equal(typeof pack === "string" || pack === null, true);
  if (previous === undefined) delete process.env.CURSOR_APP_ID;
  else process.env.CURSOR_APP_ID = previous;
});

test("the published host does not open the development pack", async () => {
  const previous = process.env.CURSOR_APP_ID;
  process.env.CURSOR_APP_ID = "public-desk";
  try {
    assert.equal(publishedHost(), true);
    assert.equal(await findDevPack(), null);
  } finally {
    if (previous === undefined) delete process.env.CURSOR_APP_ID;
    else process.env.CURSOR_APP_ID = previous;
  }
});

test("upload size is rejected before a body is accepted", () => {
  assert.match(contentLengthRejection(null) ?? "", /content length/);
  assert.match(contentLengthRejection("nope") ?? "", /not a number/);
  assert.equal(contentLengthRejection(String(8 * 1024 * 1024)), null);
  assert.match(contentLengthRejection(String(9 * 1024 * 1024)) ?? "", /8 MB/);
});

test("only two resolver processes can run at once", () => {
  const releaseA = acquirePython();
  const releaseB = acquirePython();
  assert.throws(() => acquirePython(), /busy/);
  releaseA();
  const releaseC = acquirePython();
  releaseB();
  releaseC();
});
