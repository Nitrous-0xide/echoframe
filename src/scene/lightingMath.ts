export function smoothTravel(current: number, balance: number, sensitivity: number, dt: number): number {
  const target = Math.max(.07, Math.min(.93, .5 + Math.max(-1, Math.min(1, balance)) * .43 * sensitivity));
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) * 3.2));
}
