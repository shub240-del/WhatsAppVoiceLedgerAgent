import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, makeZip } from "../../src/lib/zip";

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("the ZIP opens with standard tools and keeps names and bytes exact", async () => {
  const zip = await makeZip([
    { name: "lines/01-title.wav", data: new Blob([new Uint8Array([1, 2, 3, 250])]) },
    { name: "script.txt", data: "0:00 हर किराना दुकान में…\n" },
  ]);
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  writeFileSync(join(dir, "a.zip"), new Uint8Array(await zip.arrayBuffer()));
  execFileSync("python3", ["-c", `import zipfile;z=zipfile.ZipFile('${dir}/a.zip');assert z.testzip() is None;z.extractall('${dir}/out')`]);
  assert.deepEqual([...readFileSync(join(dir, "out/lines/01-title.wav"))], [1, 2, 3, 250]);
  assert.equal(readFileSync(join(dir, "out/script.txt"), "utf8"), "0:00 हर किराना दुकान में…\n");
});
