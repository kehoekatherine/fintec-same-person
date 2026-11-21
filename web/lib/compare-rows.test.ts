import assert from "node:assert/strict";
import test from "node:test";

import {
  cityFromAddresses,
  cityRow,
  comparisonRows,
  CUSTOMER_FILE_ABSENT,
  customerAbsenceMessage,
  dobStatus,
  entityRow,
  otherMatching,
  rowsFromStored,
} from "./compare-rows.ts";
import type { Comparison } from "./types.ts";

const stored: Comparison = {
  name: { customer: "Ada Example", hit: "Example, Ada", status: "match" },
  dateOfBirth: { customer: "1990-01-02", hit: "1990", status: "match" },
  country: { customer: "GB", hit: "United Kingdom", status: "match" },
};

test("stored comparison keeps Match, Different, and Undefined", () => {
  const rows = rowsFromStored({
    ...stored,
    dateOfBirth: { customer: "1990", hit: "1991", status: "undefined" },
    country: { customer: "Not given", hit: "France", status: "undefined" },
  });
  assert.deepEqual(
    rows.map((row) => [row.label, row.status]),
    [
      ["Name", "Match"],
      ["Date of birth", "Undefined"],
      ["Country", "Undefined"],
    ],
  );
});

test("a missing date or a one-year gap is Undefined, and a wider gap is Different", () => {
  assert.equal(dobStatus(null, ["1990"]), "Undefined");
  assert.equal(dobStatus("1990-01-02", []), "Undefined");
  assert.equal(dobStatus("1990-01-02", ["1991"]), "Undefined");
  assert.equal(dobStatus("1990-01-02", ["1989-06-01"]), "Undefined");
  assert.equal(dobStatus("1990-01-02", ["1990"]), "Match");
  assert.equal(dobStatus("1990-01-02", ["1990-01-02"]), "Match");
  assert.equal(dobStatus("1990-06-01", ["1990-01-01"]), "Different");
  assert.equal(dobStatus("1990", ["1992"]), "Different");
});

test("city is omitted until one side is known", () => {
  assert.equal(cityRow(null, null), null);
  assert.equal(cityRow("  ", ""), null);
  const known = cityRow("Leeds", null);
  assert.equal(known?.status, "Undefined");
  assert.equal(known?.label, "City");
  assert.equal(cityRow("Leeds", "Leeds")?.status, "Match");
  assert.equal(cityRow("Leeds", "York")?.status, "Different");
});

test("a simple hit address supplies a city and a country code does not", () => {
  assert.equal(
    cityFromAddresses(["Leeds [GB]"], (value) => value === "GB" || value === "United Kingdom"),
    "Leeds",
  );
  assert.equal(cityFromAddresses(["United Kingdom"], (value) => value === "United Kingdom"), null);
  assert.equal(cityFromAddresses(["12 High Street, Leeds, United Kingdom"], () => false), null);
});

test("entity type compares person and company", () => {
  assert.equal(entityRow("Individual", "Individual").status, "Match");
  assert.equal(entityRow("Individual", "Company").status, "Different");
  assert.equal(entityRow(null, "Company").status, "Undefined");
});

test("the customer file message is explicit when the folder or the id is missing", () => {
  assert.equal(CUSTOMER_FILE_ABSENT, "The customer file is not on this machine.");
  assert.equal(customerAbsenceMessage("CUS-9", false), "CUS-9 is not in customers.jsonl.");
  assert.equal(customerAbsenceMessage("AMBIGUOUS", null), "More than one customer fits this alert. No single customer record is selected.");
  assert.equal(customerAbsenceMessage("CUS-9", true), null);
});

test("fixture rows stay hidden when the development hit is not in the folder", () => {
  assert.deepEqual(
    comparisonRows({
      packPresent: true,
      hitPresent: false,
      customerInFile: false,
      stored,
      core: [],
      city: null,
      entity: entityRow(null, null),
    }),
    [],
  );
  assert.deepEqual(
    comparisonRows({
      packPresent: false,
      hitPresent: false,
      customerInFile: null,
      stored,
      core: [],
      city: null,
      entity: null,
    }),
    [],
  );
});

test("a real hit keeps the stored facts and adds city and entity", () => {
  const rows = comparisonRows({
    packPresent: true,
    hitPresent: true,
    customerInFile: true,
    stored,
    core: [],
    city: cityRow("Leeds", null),
    entity: entityRow("Individual", "Individual"),
  });
  assert.deepEqual(
    rows.map((row) => row.id),
    ["name", "dob", "country", "city", "entity"],
  );
  assert.equal(rows[0]?.customer, "Ada Example");
  assert.equal(rows[3]?.status, "Undefined");
  assert.equal(rows[4]?.status, "Match");
});

test("other matching information lists only records that exist for the hit", () => {
  const lines = otherMatching({
    hitId: "H-1",
    aliases: ["Other Name"],
    evidenceIds: ["NOTE-1", "NOTE-9", "KYC-1", "SR-1", "CUS-1"],
    checks: new Map([
      [
        "KYC-1",
        { verifiedName: "Ada Example", verifiedDob: "1990-01-02", documentCountry: "United Kingdom", result: "approved" },
      ],
    ]),
    notes: new Map([
      ["NOTE-1", "Passport check completed."],
      ["NOTE-UNUSED", "This note is on the customer but was not cited."],
    ]),
    searches: new Map([["SR-1", { title: "Listing", snippet: "A short snippet." }]]),
    account: { id: "ACC-1", customerId: "CUS-1", present: true },
  });
  assert.deepEqual(
    lines.map((line) => [line.id, line.label]),
    [
      ["H-1", "Aliases"],
      ["KYC-1", "Identity check"],
      ["NOTE-1", "Note"],
      ["SR-1", "Search result"],
      ["ACC-1", "Account"],
    ],
  );
  assert.equal(lines[1]?.line, "Verified Ada Example, 1990-01-02, document United Kingdom, approved");
  assert.equal(lines[4]?.line, "Links this alert to CUS-1");
  assert.equal(
    otherMatching({
      hitId: "H-1",
      aliases: [],
      evidenceIds: [],
      checks: new Map(),
      notes: new Map([["NOTE-1", "unread"]]),
      searches: new Map(),
      account: null,
    }).length,
    0,
  );
});
