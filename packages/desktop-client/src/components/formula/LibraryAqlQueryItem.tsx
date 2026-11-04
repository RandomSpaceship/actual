import React from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  FormulaLibraryAqlQueryEntity,
  TimeFrame,
} from '@actual-app/core/types/models';

import {
  describeAqlQuery,
  getAqlQueryFunctionName,
  getAqlQueryOneLine,
} from '#components/formula-library/aqlQueryKind';
import { QueryTimeFrameSummary } from '#components/formula-library/QueryTimeFrameSummary';

import { getAqlDateField } from './aqlSource';
import { QueryTimeFrameControl } from './QueryTimeFrameControl';

type LibraryAqlQueryItemProps = {
  item: FormulaLibraryAqlQueryEntity;
  // Set when a card query with the same name hides this query
  isHidden: boolean;
  onEdit: () => void;
  // The time frame that this card uses in place of the library one
  timeFrameOverride?: TimeFrame;
  // A null time frame removes the override. Without it, the card cannot set
  // a time frame.
  onTimeFrameOverrideChange?: (timeFrame: TimeFrame | null) => void;
};

// A library AQL query in the card editor. The edit button opens the library
// editor, which changes the query for every card.
export function LibraryAqlQueryItem({
  item,
  isHidden,
  onEdit,
  timeFrameOverride,
  onTimeFrameOverrideChange,
}: LibraryAqlQueryItemProps) {
  const { description, aql, dateField, timeFrame } = item.data;
  const { label, error } = describeAqlQuery(aql);
  // Without a date field, the query has no time frame
  const hasDateField = getAqlDateField({ text: aql, dateField }) !== null;

  return (
    <View
      style={{
        padding: 12,
        marginBottom: 10,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 4,
        backgroundColor: theme.tableBackground,
        gap: 8,
        opacity: isHidden ? 0.7 : 1,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Text style={{ fontWeight: 600, fontFamily: 'monospace' }}>
          {`${getAqlQueryFunctionName(aql)}("${item.name}")`}
        </Text>
        <Button variant="bare" onPress={onEdit}>
          <Trans>Edit</Trans>
        </Button>
      </View>
      {isHidden && (
        <Text style={{ color: theme.warningText, fontSize: 12 }}>
          <Trans>A card query with this name hides this query</Trans>
        </Text>
      )}
      {description && (
        <Text style={{ color: theme.pageTextLight, overflowWrap: 'anywhere' }}>
          {description}
        </Text>
      )}
      <Text
        style={{
          fontFamily: 'monospace',
          fontSize: 12,
          color: theme.pageTextLight,
          overflowWrap: 'anywhere',
        }}
      >
        {getAqlQueryOneLine(aql)}
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: error === undefined ? theme.pageTextSubdued : theme.errorText,
        }}
      >
        <Trans>AQL query.</Trans> {error ?? label}
      </Text>
      {hasDateField && !onTimeFrameOverrideChange && (
        <Text style={{ fontSize: 13 }}>
          <QueryTimeFrameSummary timeFrame={timeFrame ?? { mode: 'full' }} />
        </Text>
      )}
      {hasDateField && onTimeFrameOverrideChange && (
        <View>
          {timeFrameOverride && (
            <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
              <Trans>This card uses its own time frame for this query.</Trans>
            </Text>
          )}
          <QueryTimeFrameControl
            timeFrame={
              timeFrameOverride ?? {
                start: monthUtils.firstDayOfMonth(monthUtils.currentDay()),
                end: monthUtils.currentDay(),
                mode: 'full',
                ...timeFrame,
              }
            }
            onChange={onTimeFrameOverrideChange}
            isLibraryTimeFrame={!timeFrameOverride}
            onUseLibraryTimeFrame={() => onTimeFrameOverrideChange(null)}
          />
        </View>
      )}
    </View>
  );
}
