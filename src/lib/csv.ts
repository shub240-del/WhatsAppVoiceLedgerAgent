/**
 * One CSV cell, quoted. Text that a spreadsheet would run as a formula (=, +, -, @, tab, CR at the start)
 * is prefixed with an apostrophe (OWASP "CSV injection"). Plain numbers such as "-120.00" stay numbers.
 */
export function csvCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
