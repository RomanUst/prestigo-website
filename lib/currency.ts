export const EUR_TO_CZK_RATE = 25
export const CZK_TO_EUR_RATE = 0.04
export function eurToCzk(eur: number): number { return Math.round(eur * EUR_TO_CZK_RATE) }
export function czkToEur(czk: number): number { return Math.round(czk * CZK_TO_EUR_RATE) }
export function formatCZK(amount: number): string { return `${amount.toLocaleString('cs-CZ')} Kč` }
export function formatEUR(amount: number): string { return `€${amount}` }
