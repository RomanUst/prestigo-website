export const CZK_TO_EUR_RATE = 0.04
export function czkToEur(czk: number): number { return Math.round(czk * CZK_TO_EUR_RATE) }
export function formatCZK(amount: number): string { return `CZK ${amount.toLocaleString('cs-CZ')}` }
export function formatEUR(amount: number): string { return `€${amount}` }
