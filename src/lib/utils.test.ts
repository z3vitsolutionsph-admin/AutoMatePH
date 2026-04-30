import { test } from 'node:test';
import assert from 'node:assert';
import { formatCurrency } from './utils.ts';

test('formatCurrency', async (t) => {
  await t.test('handles numeric input', () => {
    assert.strictEqual(formatCurrency(1234.56), '1,234.56');
    assert.strictEqual(formatCurrency(0), '0.00');
    assert.strictEqual(formatCurrency(-1234.56), '-1,234.56');
  });

  await t.test('handles string input', () => {
    assert.strictEqual(formatCurrency('1234.56'), '1,234.56');
    assert.strictEqual(formatCurrency('0'), '0.00');
    assert.strictEqual(formatCurrency('-1234.56'), '-1,234.56');
  });

  await t.test('handles NaN and non-numeric strings', () => {
    assert.strictEqual(formatCurrency(NaN), '0.00');
    assert.strictEqual(formatCurrency('abc'), '0.00');
    assert.strictEqual(formatCurrency(''), '0.00');
  });

  await t.test('handles Infinity', () => {
    const result = formatCurrency(Infinity);
    assert.ok(result === '∞' || result === 'Infinity');

    const resultNeg = formatCurrency(-Infinity);
    assert.ok(resultNeg === '-∞' || resultNeg === '-Infinity');
  });
});
