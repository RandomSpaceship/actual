import React from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import type { FormulaLibraryQueryData } from '@actual-app/core/types/models';

import { getTimeFrameModeLabels } from '#components/formula/queryTimeFrame';
import { useDateFormat } from '#hooks/useDateFormat';

type QueryTimeFrameSummaryProps = Pick<FormulaLibraryQueryData, 'timeFrame'>;

export function QueryTimeFrameSummary({
  timeFrame,
}: QueryTimeFrameSummaryProps) {
  const { t } = useTranslation();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';

  const timeFrameMode = timeFrame?.mode ?? 'sliding-window';
  const timeFrameLabel = getTimeFrameModeLabels(t)[timeFrameMode];
  const dates =
    (timeFrameMode === 'static' || timeFrameMode === 'sliding-window') &&
    timeFrame?.start &&
    timeFrame?.end
      ? { start: timeFrame.start, end: timeFrame.end }
      : null;

  return (
    <View>
      <Text>{timeFrameLabel}</Text>
      {dates && (
        <Text style={{ color: theme.pageTextSubdued }}>
          {monthUtils.format(dates.start, dateFormat)} –{' '}
          {monthUtils.format(dates.end, dateFormat)}
        </Text>
      )}
    </View>
  );
}
