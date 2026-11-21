#!/usr/bin/env python3
"""Print every applicable reason code for each hit.

This does not write the scored output. system/run remains the decision entrypoint.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import resolve


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: explain_codes.py <data folder>", file=sys.stderr)
        sys.exit(2)
    json.dump(resolve.explain_codes(Path(sys.argv[1])), sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
