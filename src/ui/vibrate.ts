/** Vibrace telefonu (Android / Chrome); kde prohlížeč neumí (Safari na iPhonu), nic se nestane. */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // bez vibrace
  }
}
