import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('should debounce the value update', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 500 },
      }
    );

    expect(result.current).toBe('initial');

    // Update the value
    rerender({ value: 'updated', delay: 500 });

    // Should still be initial immediately after update
    expect(result.current).toBe('initial');

    // Fast-forward time by 250ms
    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Should still be initial
    expect(result.current).toBe('initial');

    // Fast-forward time by another 250ms (total 500ms)
    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Now it should be updated
    expect(result.current).toBe('updated');
  });

  it('should reset the timer when the value changes before the delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 500 },
      }
    );

    // Update the value first time
    rerender({ value: 'update 1', delay: 500 });

    // Advance time by 300ms
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Update the value second time
    rerender({ value: 'update 2', delay: 500 });

    // Advance time by 300ms (total 600ms since update 1, but only 300ms since update 2)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should still be initial because the timer was reset
    expect(result.current).toBe('initial');

    // Advance time by another 200ms (total 500ms since update 2)
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe('update 2');
  });

  it('should handle different delay values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 1000 },
      }
    );

    rerender({ value: 'updated', delay: 1000 });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('initial');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('updated');
  });
});
