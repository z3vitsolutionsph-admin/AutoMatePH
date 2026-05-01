import { test, describe } from 'node:test';
import assert from 'node:assert';
import { cn, formatCurrency } from './utils.ts';

describe('cn utility', () => {
  test('joins class names', () => {
    assert.strictEqual(cn('a', 'b'), 'a b');
  });

  test('handles conditional classes', () => {
    assert.strictEqual(cn('a', true && 'b', false && 'c'), 'a b');
  });

  test('merges tailwind classes correctly', () => {
    // tailwind-merge should resolve conflicts
    assert.strictEqual(cn('p-4 p-2'), 'p-2');
    assert.strictEqual(cn('text-red-500 text-blue-500'), 'text-blue-500');
  });

  test('handles arrays and objects', () => {
    assert.strictEqual(cn(['a', 'b'], { c: true, d: false }), 'a b c');
  });

  test('handles empty or undefined inputs', () => {
    assert.strictEqual(cn('', undefined, null as any), '');
  });
});

describe('formatCurrency utility', () => {
  test('formats numbers correctly for en-PH', () => {
    assert.strictEqual(formatCurrency(1000), '1,000.00');
    assert.strictEqual(formatCurrency(1234.56), '1,234.56');
    assert.strictEqual(formatCurrency(0), '0.00');
  });

  test('formats numeric strings correctly', () => {
    assert.strictEqual(formatCurrency('1000'), '1,000.00');
    assert.strictEqual(formatCurrency('1234.56'), '1,234.56');
  });

  test('handles negative numbers', () => {
    // Note: Behavior might vary slightly by Node version for negative signs/symbols in en-PH
    // but usually it's -1,000.00 or (1,000.00). Let's check what this environment does.
    const result = formatCurrency(-1000);
    assert.ok(result.includes('1,000.00'));
    assert.ok(result.includes('-'));
  });

  test('returns 0.00 for invalid inputs', () => {
    assert.strictEqual(formatCurrency('abc'), '0.00');
    assert.strictEqual(formatCurrency(NaN), '0.00');
    assert.strictEqual(formatCurrency(''), '0.00');
  });

  test('handles large numbers', () => {
    assert.strictEqual(formatCurrency(1000000), '1,000,000.00');
  });
});
