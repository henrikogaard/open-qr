/**
 * Minimal CSV parser — RFC 4180-ish.
 *
 * Why no library: the bulk-import use case is small (validated row-by-row,
 * fields don't contain wild content), and adding a parser dependency to the
 * production image for ~40 lines of state-machine isn't worth it.
 *
 * Returns an array of rows; each row is an array of trimmed string fields.
 * Quoted fields preserve their interior whitespace; unquoted fields are
 * trimmed. Skips empty trailing rows.
 */

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];

    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }

    if (c === ',') {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (c === '\n' || c === '\r') {
      // \r\n: skip the \n
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += c;
  }

  // Tail row
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell !== '')) rows.push(row);
  }

  return rows;
}
