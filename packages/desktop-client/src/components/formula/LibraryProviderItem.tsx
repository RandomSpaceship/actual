import React from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { amountToInteger } from '@actual-app/core/shared/util';
import type {
  FormulaLibraryProviderEntity,
  FormulaTimeFrameOverride,
} from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import type { SimpleAccount } from '#components/formula/executeFormula';
import type { FormulaQueryConfig } from '#components/formula/resolveQuery';
import { useFormat } from '#hooks/useFormat';
import { useFormulaExecution } from '#hooks/useFormulaExecution';

import { FormulaWarnings } from './FormulaWarnings';

type LibraryProviderItemProps = {
  item: FormulaLibraryProviderEntity;
  // The card queries and overrides, so that the value is the value on this
  // card
  queries: Record<string, FormulaQueryConfig>;
  timeFrameOverrides: Record<string, FormulaTimeFrameOverride>;
  accounts: SimpleAccount[];
  onEdit: () => void;
  // Without it, there is no insert button
  onInsert?: () => void;
};

// A library provider in the card editor. It is read-only here: the edit
// button opens the library editor, which changes the provider for every card.
export function LibraryProviderItem({
  item,
  queries,
  timeFrameOverrides,
  accounts,
  onEdit,
  onInsert,
}: LibraryProviderItemProps) {
  const format = useFormat();
  const { description, formula } = item.data;
  const value = useFormulaExecution(
    `=${item.name}`,
    queries,
    undefined,
    undefined,
    accounts,
    timeFrameOverrides,
  );

  return (
    <View
      style={{
        padding: 12,
        marginBottom: 10,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 4,
        backgroundColor: theme.tableBackground,
        gap: 8,
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
          {item.name}
        </Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {onInsert && (
            <Button variant="bare" onPress={onInsert}>
              <Trans>Insert</Trans>
            </Button>
          )}
          <Button variant="bare" onPress={onEdit}>
            <Trans>Edit</Trans>
          </Button>
        </View>
      </View>
      {description && (
        <Text style={{ color: theme.pageTextLight, overflowWrap: 'anywhere' }}>
          {description}
        </Text>
      )}
      <Text
        style={{
          fontFamily: 'monospace',
          fontSize: 13,
          color: theme.pageTextSubdued,
          overflowWrap: 'anywhere',
        }}
      >
        {formula}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          <Trans>Value on this card:</Trans>
        </Text>
        {/* The last value stays while the formula runs again */}
        {value.error ? (
          <Text style={{ color: theme.errorText, fontSize: 13 }}>
            {value.error}
          </Text>
        ) : typeof value.result === 'number' ? (
          <FinancialText style={{ fontSize: 13 }}>
            {format(amountToInteger(value.result), 'financial')}
          </FinancialText>
        ) : (
          <Text style={{ fontSize: 13 }}>{value.result}</Text>
        )}
      </View>
      <FormulaWarnings issues={value.issues} />
    </View>
  );
}
