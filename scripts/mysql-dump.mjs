import { readFileSync } from 'node:fs';

// Read mysqldump data as literals. Never execute statements from the backup.
export function parseValues(text) {
  let i = 0;
  const rows = [];
  const whitespace = () => { while (/\s/.test(text[i] ?? '') && i < text.length) i++; };
  const expect = (character) => {
    whitespace();
    if (text[i++] !== character) throw new Error(`Expected ${character} at offset ${i - 1}`);
  };
  const escapes = { '0': '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a', "'": "'", '"': '"', '\\': '\\' };
  while (i < text.length) {
    expect('(');
    const row = [];
    for (;;) {
      whitespace();
      if (text[i] === "'") {
        i++;
        let value = '', closed = false;
        while (i < text.length) {
          const character = text[i++];
          if (character === '\\') {
            const escaped = text[i++];
            if (escaped === undefined) throw new Error('Incomplete escape');
            value += escapes[escaped] ?? (['%', '_'].includes(escaped) ? '\\' + escaped : escaped);
          } else if (character === "'") {
            if (text[i] === "'") { value += "'"; i++; }
            else { closed = true; break; }
          } else value += character;
        }
        if (!closed) throw new Error('Unterminated string');
        row.push(value);
      } else {
        const start = i;
        while (i < text.length && ![',', ')'].includes(text[i])) i++;
        const token = text.slice(start, i).trim();
        if (token === 'NULL') row.push(null);
        else if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)) row.push(token);
        else throw new Error(`Unsupported SQL literal at offset ${start}`);
      }
      whitespace();
      if (text[i] === ')') { i++; break; }
      expect(',');
    }
    rows.push(row);
    whitespace();
    if (i === text.length) break;
    expect(',');
  }
  return rows;
}

export function readDump(path) {
  const text = readFileSync(path, 'utf8');
  const tables = {};
  for (const match of text.matchAll(/CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\) ENGINE=[^;]+;/g)) {
    tables[match[1]] = {
      columns: [...match[2].matchAll(/^\s+`([^`]+)` /gm)].map((column) => column[1]),
      rows: [],
      nextId: /AUTO_INCREMENT=(\d+)/.exec(match[0])?.[1] ?? null,
    };
  }
  let parsedInserts = 0;
  for (const match of text.matchAll(/^INSERT INTO `([^`]+)` VALUES (.*);\r?$/gm)) {
    const table = tables[match[1]];
    if (!table) throw new Error(`Missing table definition: ${match[1]}`);
    for (const values of parseValues(match[2])) {
      if (values.length !== table.columns.length) throw new Error(`Column count mismatch: ${match[1]}`);
      table.rows.push(Object.fromEntries(table.columns.map((column, index) => [column, values[index]])));
    }
    parsedInserts++;
  }
  if (parsedInserts !== [...text.matchAll(/^INSERT INTO /gm)].length) throw new Error('Unsupported INSERT format');
  if (!Object.keys(tables).length) throw new Error('No tables found');
  return tables;
}
