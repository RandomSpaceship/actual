import * as monthUtils from '@actual-app/core/shared/months';
import type { TimeFrame } from '@actual-app/core/types/models';
import type { TFunction } from 'i18next';

function isMonthString(dateOrMonth: string) {
  // Month format: YYYY-MM
  return dateOrMonth.split('-').length === 2;
}

/**
 * Query formulas use day-level filtering in AQL (`$gte/$lte` on YYYY-MM-DD).
 * The query editor UI selects months, so we normalize month strings to days.
 */
export function normalizeQueryTimeFrameStart(dateOrMonth: string) {
  return isMonthString(dateOrMonth)
    ? monthUtils.firstDayOfMonth(dateOrMonth)
    : monthUtils.dayFromDate(dateOrMonth);
}

export function normalizeQueryTimeFrameEnd(dateOrMonth: string) {
  return isMonthString(dateOrMonth)
    ? monthUtils.lastDayOfMonth(dateOrMonth)
    : monthUtils.dayFromDate(dateOrMonth);
}

// The time frame of a new query: this month, live
export function newQueryTimeFrame(): TimeFrame {
  return {
    start: monthUtils.firstDayOfMonth(monthUtils.currentDay()),
    end: monthUtils.currentDay(),
    mode: 'sliding-window',
  };
}

export function getTimeFrameModeLabels(t: TFunction) {
  return {
    'sliding-window': t('Live'),
    static: t('Static'),
    full: t('All time'),
    lastMonth: t('Last month'),
    lastYear: t('Last year'),
    yearToDate: t('Year to date'),
    priorYearToDate: t('Prior year to date'),
    currentQuarter: t('Current quarter'),
    previousQuarter: t('Previous quarter'),
  } satisfies Record<TimeFrame['mode'], string>;
}
