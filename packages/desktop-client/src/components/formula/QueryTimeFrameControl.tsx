import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { DateRangePicker } from '@actual-app/components/date-range-picker';
import type { DateRangePreset } from '@actual-app/components/date-range-picker';
import { Input } from '@actual-app/components/input';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import type { TimeFrame } from '@actual-app/core/types/models';

import { buildDateRangePresets } from '#components/reports/dateRangePresets';
import { clampMonthRangeToBounds } from '#components/reports/monthRange';
import {
  asMonthSlidingTimeFrame,
  calculateTimeRange,
} from '#components/reports/reportRanges';
import { useDateFormat } from '#hooks/useDateFormat';
import { useLanguage } from '#hooks/useLocale';

import {
  getTimeFrameModeLabels,
  normalizeQueryTimeFrameEnd,
  normalizeQueryTimeFrameStart,
} from './queryTimeFrame';

export function normalizeMonthRangeForPicker(start: string, end: string) {
  return [monthUtils.getMonth(start), monthUtils.getMonth(end)] satisfies [
    string,
    string,
  ];
}

export function normalizeMonthPickerSelectionForQuery(
  start: string,
  end: string,
) {
  return [
    normalizeQueryTimeFrameStart(start),
    normalizeQueryTimeFrameEnd(end),
  ] satisfies [string, string];
}

export function shouldIgnoreMonthPickerNoop(
  startDate: string,
  endDate: string,
  nextStart: string,
  nextEnd: string,
) {
  const [currentStartMonth, currentEndMonth] = normalizeMonthRangeForPicker(
    startDate,
    endDate,
  );

  return currentStartMonth === nextStart && currentEndMonth === nextEnd;
}

export function canRenderDateRangePicker(
  isTransactionBoundsReady: boolean,
  earliestMonth: string,
  latestMonth: string,
) {
  return (
    isTransactionBoundsReady && Boolean(earliestMonth) && Boolean(latestMonth)
  );
}

export function calculateDateRangeBoundMonths(
  earliestTransaction: { date: string } | null,
  latestTransaction: { date: string } | null,
) {
  const currentMonth = monthUtils.currentMonth();
  const currentDay = monthUtils.currentDay();

  const earliestTransactionDate = earliestTransaction
    ? earliestTransaction.date
    : currentDay;
  const latestTransactionDate = latestTransaction
    ? latestTransaction.date
    : currentDay;

  const computedEarliestMonth = earliestTransaction
    ? monthUtils.getMonth(earliestTransaction.date)
    : currentMonth;
  const latestTransactionMonth = latestTransaction
    ? monthUtils.getMonth(latestTransaction.date)
    : currentMonth;

  const computedLatestMonth =
    latestTransactionMonth > currentMonth
      ? latestTransactionMonth
      : currentMonth;

  return {
    earliestMonth: computedEarliestMonth,
    latestMonth: computedLatestMonth,
    earliestTransactionDate,
    latestTransactionDate,
  };
}

type PresetTimeRangeMode = Exclude<
  TimeFrame['mode'],
  'sliding-window' | 'static'
>;

function isPresetTimeRangeMode(
  mode: TimeFrame['mode'],
): mode is PresetTimeRangeMode {
  return !['sliding-window', 'static'].includes(mode);
}

type QueryTimeFrameControlProps = {
  timeFrame: TimeFrame;
  onChange: (timeFrame: TimeFrame) => void;
  // For a library query in a card. With it, the mode button cycles
  // Library -> Live -> Static -> Library. In the Library state, timeFrame is
  // the library time frame, and a change gives the card its own time frame.
  onUseLibraryTimeFrame?: () => void;
  isLibraryTimeFrame?: boolean;
};

// The time frame of a query: the mode button, the date range picker, and the
// name of a preset range
export function QueryTimeFrameControl({
  timeFrame,
  onChange,
  onUseLibraryTimeFrame,
  isLibraryTimeFrame = false,
}: QueryTimeFrameControlProps) {
  const language = useLanguage();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const { t } = useTranslation();
  const { start: startDate, end: endDate, mode: timeRangeMode } = timeFrame;

  const [earliestMonth, setEarliestMonth] = useState(monthUtils.currentMonth());
  const [latestMonth, setLatestMonth] = useState(monthUtils.currentMonth());
  const [isTransactionBoundsReady, setIsTransactionBoundsReady] =
    useState(false);
  const [earliestTransaction, setEarliestTransaction] = useState(
    monthUtils.currentDay(),
  );
  const [latestTransaction, setLatestTransaction] = useState(
    monthUtils.currentDay(),
  );

  // Fetch transaction bounds for per-query date picker limits and presets.
  useEffect(() => {
    async function run() {
      try {
        const [earliestTransactionResult, latestTransactionResult] =
          await Promise.all([
            send('get-earliest-transaction').catch(() => null),
            send('get-latest-transaction').catch(() => null),
          ]);

        const computedBounds = calculateDateRangeBoundMonths(
          earliestTransactionResult,
          latestTransactionResult,
        );

        setEarliestTransaction(computedBounds.earliestTransactionDate);
        setLatestTransaction(computedBounds.latestTransactionDate);

        // Make sure the month selects are at least populated with a
        // year's worth of months. We can undo this when we have fancier
        // date selects.
        let computedEarliestMonth = computedBounds.earliestMonth;
        const yearAgo = monthUtils.subMonths(computedBounds.latestMonth, 12);
        if (computedEarliestMonth > yearAgo) {
          computedEarliestMonth = yearAgo;
        }

        setEarliestMonth(computedEarliestMonth);
        setLatestMonth(computedBounds.latestMonth);
      } finally {
        setIsTransactionBoundsReady(true);
      }
    }
    void run();
  }, []);

  const isPresetTimeRange = isPresetTimeRangeMode(timeRangeMode);
  const timeRangeLabels = getTimeFrameModeLabels(t);
  const timeRangeLabel = timeRangeLabels[timeRangeMode];
  const presetTimeRangeLabels = {
    full: t('All time transactions'),
    lastMonth: t('Last month transactions'),
    lastYear: t('Last year transactions'),
    yearToDate: t('Year to date transactions'),
    priorYearToDate: t('Prior year to date transactions'),
    currentQuarter: t('Current quarter transactions'),
    previousQuarter: t('Previous quarter transactions'),
  } satisfies Record<PresetTimeRangeMode, string>;
  const presetTimeRangeLabel = isPresetTimeRange
    ? presetTimeRangeLabels[timeRangeMode]
    : null;

  function formatDayLabel(date: string) {
    return monthUtils.format(date, dateFormat);
  }

  const [pickerStartDate, pickerEndDate] = clampMonthRangeToBounds(
    ...normalizeMonthRangeForPicker(startDate, endDate),
    earliestMonth,
    latestMonth,
  );

  const presets: DateRangePreset[] = buildDateRangePresets({
    t,
    onSelectRange: ([rangeStart, rangeEnd, rangeMode]) => {
      const [normalizedRangeStart, normalizedRangeEnd] =
        normalizeMonthPickerSelectionForQuery(rangeStart, rangeEnd);

      onChange({
        start: normalizedRangeStart,
        end: normalizedRangeEnd,
        mode: rangeMode,
      });
    },
    earliestTransaction,
    latestTransaction,
    show1Month: true,
    includeAllTime: true,
  });

  const isDateRangePickerReady = canRenderDateRangePicker(
    isTransactionBoundsReady,
    earliestMonth,
    latestMonth,
  );

  return (
    <View style={{ marginBottom: 12 }}>
      <View
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 16,
          alignItems: 'center',
        }}
      >
        <Button
          style={{ minWidth: 50 }}
          variant={
            isLibraryTimeFrame || timeRangeMode !== 'static'
              ? 'primary'
              : 'normal'
          }
          onPress={() => {
            if (
              onUseLibraryTimeFrame &&
              !isLibraryTimeFrame &&
              timeRangeMode === 'static'
            ) {
              onUseLibraryTimeFrame();
              return;
            }

            const newMode =
              isLibraryTimeFrame || timeRangeMode === 'static'
                ? 'sliding-window'
                : 'static';
            const [newStart, newEnd] = calculateTimeRange(
              asMonthSlidingTimeFrame({
                start: startDate,
                end: endDate,
                mode: newMode,
              }),
            );

            onChange({ start: newStart, end: newEnd, mode: newMode });
          }}
        >
          {isLibraryTimeFrame ? t('Library') : timeRangeLabel}
        </Button>
        {isDateRangePickerReady ? (
          <DateRangePicker
            start={pickerStartDate}
            end={pickerEndDate}
            minDate={earliestMonth}
            maxDate={latestMonth}
            granularities={['month']}
            locale={language}
            formatDayLabel={formatDayLabel}
            labels={{
              selectBy: t('Select by'),
              quickSelect: t('Quick select'),
              month: t('Month'),
              day: t('Day'),
              previous: t('Previous'),
              next: t('Next'),
              previousMonth: t('Previous month'),
              nextMonth: t('Next month'),
              year: t('Year'),
              dateRange: t('Date range'),
            }}
            presets={presets}
            onChangeDates={(newStart, newEnd) => {
              if (
                shouldIgnoreMonthPickerNoop(
                  startDate,
                  endDate,
                  newStart,
                  newEnd,
                )
              ) {
                return;
              }

              const [normalizedStart, normalizedEnd] =
                normalizeMonthPickerSelectionForQuery(newStart, newEnd);

              onChange({
                start: normalizedStart,
                end: normalizedEnd,
                mode: 'static',
              });
            }}
          />
        ) : (
          <Button
            variant="normal"
            isDisabled
            aria-label={t('Loading date range...')}
          >
            {t('Loading date range...')}
          </Button>
        )}
      </View>

      {presetTimeRangeLabel ? (
        <Input
          value={presetTimeRangeLabel}
          readOnly
          disabled
          style={{
            width: '100%',
            marginTop: 8,
            textAlign: 'center',
          }}
        />
      ) : null}
    </View>
  );
}
