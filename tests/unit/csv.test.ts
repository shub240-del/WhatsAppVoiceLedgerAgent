import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "../../src/lib/csv";

test("CSV export neutralises spreadsheet formulas but keeps numbers", () => {
  assert.equal(csvCell('=HYPERLINK("http://evil","x")'), `"'=HYPERLINK(""http://evil"",""x"")"`);
  for (const bad of ["+SUM(A1)", "-2+3", "@cmd", "\t=1"]) assert.ok(csvCell(bad).startsWith(`"'`), bad);
  assert.equal(csvCell("-120.00"), `"-120.00"`);
  assert.equal(csvCell("Ramesh"), `"Ramesh"`);
  assert.equal(csvCell(null), `""`);
  assert.equal(toCsv([["a", 1], ["b", "c"]]), `"a","1"\r\n"b","c"`);
});
