// Delimited-text tokenizer for the CSV import path.
//
// Hand-rolled rather than a dependency: the real KBC export is `;`-separated with ZERO quoted
// fields, so a library would be 19 KB of bundle for a split(). The quoting rules are still
// implemented in full (RFC 4180) because a future export that quotes a field containing `;`
// must not silently shift every column after it — a shifted column is exactly the kind of
// mis-parse this pipeline has to refuse rather than import.
//
// Handles: quoted fields, escaped `""` inside them, delimiters and newlines inside quotes,
// CR / LF / CRLF line endings (the KBC export is CR-only), and a leading BOM.

/**
 * @param {string} text
 * @param {string} [delimiter]  single character
 * @returns {string[][]}  rows of raw (untrimmed) field strings; blank lines dropped
 */
export function parseDelimited(text, delimiter = ';') {
  if (typeof text !== 'string' || text === '') return []

  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const rows = []
  let row = []
  let field = ''
  let quoted = false      // inside a quoted field
  let fieldWasQuoted = false

  const endField = () => {
    row.push(field)
    field = ''
    fieldWasQuoted = false
  }
  // A row of one empty field is a blank line, not a record — dropping it here keeps every
  // caller from having to filter, and the KBC export ends with a trailing terminator.
  const endRow = () => {
    endField()
    if (!(row.length === 1 && row[0] === '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }   // escaped quote
        else quoted = false
        continue
      }
      field += ch
      continue
    }

    if (ch === '"' && field === '') { quoted = true; fieldWasQuoted = true; continue }
    if (ch === delimiter) { endField(); continue }

    if (ch === '\r') {
      // Consume CRLF as ONE terminator; a bare CR is also a terminator (KBC's format).
      if (src[i + 1] === '\n') i++
      endRow()
      continue
    }
    if (ch === '\n') { endRow(); continue }

    field += ch
  }

  // A file not ending in a terminator still has a final record.
  if (field !== '' || fieldWasQuoted || row.length > 0) endRow()

  return rows
}
