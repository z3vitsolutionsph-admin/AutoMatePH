import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string): string {
  const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(parsedAmount)) return '0.00';
  return parsedAmount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Plays a short beep sound using the Web Audio API.
 * Improvements: Handles suspended state, resource cleanup, and type-safe error handling.
 */
export function playBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();

    // Resume context if suspended (common in some browsers until user interaction)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((err: unknown) => {
        console.warn('AudioContext resume failed:', err instanceof Error ? err.message : String(err));
      });
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.value = 800;
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

    oscillator.start();

    // Stop after 100ms and cleanup
    setTimeout(() => {
      try {
        oscillator.stop();
        // Short delay before closing to allow for release tail if any
        setTimeout(() => {
          if (audioCtx.state !== 'closed') {
            audioCtx.close().catch((err: unknown) => {
              console.warn('AudioContext close failed:', err instanceof Error ? err.message : String(err));
            });
          }
        }, 100);
      } catch (err: unknown) {
        // Ignore errors if oscillator was already stopped
      }
    }, 100);
  } catch (error: unknown) {
    console.error("Audio beep failed:", error instanceof Error ? error.message : String(error));
  }
}
