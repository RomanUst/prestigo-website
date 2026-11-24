// Seasonal tours (migration 095): a tour may be bookable only between bookable_from and bookable_until,
// both inclusive Europe/Prague pickup dates (YYYY-MM-DD); null on a side means open-ended. Pure and client-safe.

export interface TourSeason {
  from?: string | null
  until?: string | null
}

/** True when the pickup date (YYYY-MM-DD) lies inside the season; a tour with no season is always in season. */
export function isInSeason(date: string, season: TourSeason | null | undefined): boolean {
  if (!season) return true
  if (season.from && date < season.from) return false
  if (season.until && date > season.until) return false
  return true
}

/** True when the season is over: bookable_until is before today (Prague). */
export function isSeasonOver(season: TourSeason | null | undefined, todayIso: string): boolean {
  return !!season?.until && season.until < todayIso
}

/** True when the tour has any date limit. */
export function hasSeason(season: TourSeason | null | undefined): season is TourSeason {
  return !!season && (!!season.from || !!season.until)
}
