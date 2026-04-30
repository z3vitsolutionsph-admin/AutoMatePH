import test from 'node:test';
import assert from 'node:assert';
import { formatCurrency } from './utils.ts';

test('formatCurrency should format numbers correctly', (t) => {
  assert.strictEqual(formatCurrency(1234.56), '1,234.56');
  assert.strictEqual(formatCurrency(0), '0.00');
  assert.strictEqual(formatCurrency(-123.4), '-123.40');
  assert.strictEqual(formatCurrency(1000000), '1,000,000.00');
});

test('formatCurrency should format numeric strings correctly', (t) => {
  assert.strictEqual(formatCurrency('1234.56'), '1,234.56');
  assert.strictEqual(formatCurrency('0'), '0.00');
});

test('formatCurrency should return 0.00 for invalid inputs', (t) => {
  // @ts-ignore
  assert.strictEqual(formatCurrency('abc'), '0.00');
  // @ts-ignore
  assert.strictEqual(formatCurrency(NaN), '0.00');
  // @ts-ignore
  assert.strictEqual(formatCurrency(undefined), '0.00');
});
