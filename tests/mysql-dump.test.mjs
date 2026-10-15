import test from 'node:test';
import assert from 'node:assert/strict';
import { parseValues } from '../scripts/mysql-dump.mjs';

test('preserves decimal precision, NULL, Chinese text and SQL-looking strings', () => {
  assert.deepEqual(parseValues("(1,'中文; DROP TABLE users;',NULL,99999999999999.1234),(2,'',0,-1.50)"), [
    ['1', '中文; DROP TABLE users;', null, '99999999999999.1234'], ['2', '', '0', '-1.50'],
  ]);
});
test('decodes MySQL escapes without altering escaped JSON or tuple-like text', () => {
  assert.deepEqual(parseValues(String.raw`('O\'Brien','a\\b','line\nnext','[{\"quantity\":1.5}]','x),(y','it''s')`), [
    ["O'Brien", 'a\\b', 'line\nnext', '[{"quantity":1.5}]', 'x),(y', "it's"],
  ]);
});
test('rejects expressions, truncated data and unsupported literals', () => {
  for (const text of ["(NOW())", "('unfinished)", '(1),(2', '(1); DROP TABLE users']) assert.throws(() => parseValues(text));
});
