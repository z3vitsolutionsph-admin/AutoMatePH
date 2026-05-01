import test from 'node:test';
import assert from 'node:assert';
import { formatCurrency } from './utils';

test('formatCurrency', async (t) => {
  await t.test('formats valid numbers correctly', () => {
    assert.strictEqual(formatCurrency(1234.56), '1,234.56');
    assert.strictEqual(formatCurrency(1000), '1,000.00');
    assert.strictEqual(formatCurrency(0.5), '0.50');
  });

  await t.test('formats valid numeric strings correctly', () => {
    assert.strictEqual(formatCurrency('1234.56'), '1,234.56');
    assert.strictEqual(formatCurrency('1000'), '1,000.00');
    assert.strictEqual(formatCurrency('0.5'), '0.50');
  });

  await t.test('handles zero correctly', () => {
    assert.strictEqual(formatCurrency(0), '0.00');
    assert.strictEqual(formatCurrency('0'), '0.00');
  });

  await t.test('handles NaN correctly', () => {
    assert.strictEqual(formatCurrency(NaN), '0.00');
  });

  await t.test('handles non-numeric strings correctly', () => {
    assert.strictEqual(formatCurrency('invalid-string'), '0.00');
    assert.strictEqual(formatCurrency('abc'), '0.00');
  });

  await t.test('handles Infinity correctly', () => {
    assert.strictEqual(formatCurrency(Infinity), '∞');
  });

  await t.test('handles -Infinity correctly', () => {
    assert.strictEqual(formatCurrency(-Infinity), '-∞');
  });
});
