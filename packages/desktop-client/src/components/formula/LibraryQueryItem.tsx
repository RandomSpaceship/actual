import React from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  FormulaLibraryQueryEntity,
  TimeFrame,
} from '@actual-app/core/types/models';

import { QueryConditionsSummary } from '#components/formula-library/QueryConditionsSummary';
import { QueryTimeFrameSummary } from '#components/formula-library/QueryTimeFrameSummary';

import { newQueryTimeFrame } from './queryTimeFrame';
import { QueryTimeFrameControl } from './QueryTimeFrameControl';

type LibraryQueryItemProps = {
  item: FormulaLibraryQueryEntity;
  // Set when a card query with the same name hides this query
  isHidden: boolean;
  onEdit: () => void;
  // Without it, there is no copy button
  onCopyIntoCard?: () => void;
  // The time frame that this card uses in place of the library one
  timeFrameOverride?: TimeFrame;
  // A null time frame removes the override. Without it, the card cannot
  // set a time frame.
  onTimeFrameOverrideChange?: (timeFrame: TimeFrame | null) => void;
};

// A library query in the card editor. It is read-only here: the edit button
// opens the library editor, which changes the query for every card.
export function LibraryQueryItem({
  item,
  isHidden,
  onEdit,
  onCopyIntoCard,
  timeFrameOverride,
  onTimeFrameOverrideChange,
}: LibraryQueryItemProps) {
  const { description, conditions, conditionsOp, timeFrame } = item.data;
  const isOverridden = Boolean(onTimeFrameOverrideChange && timeFrameOverride);

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
          {`QUERY("${item.name}")`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {onCopyIntoCard && (
            <Button variant="bare" onPress={onCopyIntoCard}>
              <Trans>Copy into card</Trans>
            </Button>
          )}
          <Button variant="bare" onPress={onEdit}>
            <Trans>Edit</Trans>
          </Button>
        </View>
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
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: 13,
        }}
      >
        <QueryConditionsSummary
          conditions={conditions}
          conditionsOp={conditionsOp}
        />
        {!isOverridden && (
          <View style={{ flexShrink: 0, textAlign: 'right' }}>
            <QueryTimeFrameSummary timeFrame={timeFrame} />
          </View>
        )}
      </View>
      {onTimeFrameOverrideChange && timeFrameOverride && (
        <View>
          <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
            <Trans>This card uses its own time frame for this query.</Trans>
          </Text>
          <QueryTimeFrameControl
            timeFrame={timeFrameOverride}
            onChange={onTimeFrameOverrideChange}
          />
        </View>
      )}
      {onTimeFrameOverrideChange && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          {timeFrameOverride ? (
            <Button
              variant="bare"
              onPress={() => onTimeFrameOverrideChange(null)}
            >
              <Trans>Use the library time frame</Trans>
            </Button>
          ) : (
            <Button
              variant="bare"
              onPress={() =>
                onTimeFrameOverrideChange({
                  ...newQueryTimeFrame(),
                  ...timeFrame,
                })
              }
            >
              <Trans>Use a card time frame</Trans>
            </Button>
          )}
        </View>
      )}
    </View>
  );
}
