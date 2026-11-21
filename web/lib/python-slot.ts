import { DeskError } from "./errors.ts";

const MAX_PYTHON = 4;
let active = 0;

export function acquirePython(): () => void {
  if (active >= MAX_PYTHON) {
    throw new DeskError("The resolver is busy. Try again in a moment.", { status: 429 });
  }
  active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active -= 1;
  };
}
