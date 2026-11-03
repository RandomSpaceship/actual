import React from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { FormulaLibraryQueryEntity } from '@actual-app/core/types/models';

import { QueryConditionsSummary } from '#components/formula-library/QueryConditionsSummary';
import { QueryTimeFrameSummary } from '#components/formula-library/QueryTimeFrameSummary';

type LibraryQueryItemProps = {
  item: FormulaLibraryQueryEntity;
  // Set when a card query with the same name hides this query
  isHidden: boolean;
  onEdit: () => void;
  // Without it, there is no copy button
  onCopyIntoCard?: () => void;
};

// A library query in the card editor. It is read-only here: the edit button
// opens the library editor, which changes the query for every card.
export function LibraryQueryItem({
  item,
  isHidden,
  onEdit,
  onCopyIntoCard,
}: LibraryQueryItemProps) {
  const { description, conditions, conditionsOp, timeFrame } = item.data;

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
        <View style={{ flexShrink: 0, textAlign: 'right' }}>
          <QueryTimeFrameSummary timeFrame={timeFrame} />
        </View>
      </View>
    </View>
  );
}
