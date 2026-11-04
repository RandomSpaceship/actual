import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgTrash } from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { amountToInteger } from '@actual-app/core/shared/util';
import type {
  FormulaLibraryProviderData,
  FormulaTimeFrameOverride,
} from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import type { SimpleAccount } from '#components/formula/executeFormula';
import type { CardProviders } from '#components/formula/resolveProviders';
import type { FormulaQueryConfig } from '#components/formula/resolveQuery';
import { useFormat } from '#hooks/useFormat';
import { useFormulaExecution } from '#hooks/useFormulaExecution';

import { FormulaWarnings } from './FormulaWarnings';

type ProviderItemProps = {
  name: string;
  data: FormulaLibraryProviderData;
  // Set for a library provider that a card provider with the same name hides.
  // It then shows no value.
  isHidden?: boolean;
  // A short line under the name
  warning?: string;
  // The card queries, overrides and providers, so that the value is the value
  // on this card
  queries: Record<string, FormulaQueryConfig>;
  timeFrameOverrides: Record<string, FormulaTimeFrameOverride>;
  cardProviders: CardProviders;
  accounts: SimpleAccount[];
  onEdit: () => void;
  // Each button shows only when its handler is set
  onInsert?: () => void;
  onCopyIntoCard?: () => void;
  onMakeShared?: () => void;
  onRemove?: () => void;
};

// A card provider or a library provider in the card editor. For a library
// provider, the edit button opens the library editor, which changes the
// provider for every card.
export function ProviderItem({
  name,
  data,
  isHidden = false,
  warning,
  queries,
  timeFrameOverrides,
  cardProviders,
  accounts,
  onEdit,
  onInsert,
  onCopyIntoCard,
  onMakeShared,
  onRemove,
}: ProviderItemProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const { description, formula } = data;
  const value = useFormulaExecution(
    isHidden ? '' : `=${name}`,
    queries,
    undefined,
    undefined,
    accounts,
    timeFrameOverrides,
    'value',
    cardProviders,
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
        <Text style={{ fontWeight: 600, fontFamily: 'monospace' }}>{name}</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {onInsert && (
            <Button variant="bare" onPress={onInsert}>
              <Trans>Insert</Trans>
            </Button>
          )}
          {onCopyIntoCard && (
            <Button variant="bare" onPress={onCopyIntoCard}>
              <Trans>Copy into card</Trans>
            </Button>
          )}
          {onMakeShared && (
            <Button variant="bare" onPress={onMakeShared}>
              <Trans>Make shared</Trans>
            </Button>
          )}
          <Button variant="bare" onPress={onEdit}>
            <Trans>Edit</Trans>
          </Button>
          {onRemove && (
            <Button
              variant="bare"
              onPress={onRemove}
              aria-label={t('Remove provider')}
            >
              <SvgTrash style={{ width: 13, height: 13 }} />
            </Button>
          )}
        </View>
      </View>
      {isHidden && (
        <Text style={{ color: theme.warningText, fontSize: 12 }}>
          <Trans>A card provider with this name hides this provider</Trans>
        </Text>
      )}
      {warning && (
        <Text style={{ color: theme.warningText, fontSize: 12 }}>
          {warning}
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
          fontSize: 13,
          color: theme.pageTextSubdued,
          overflowWrap: 'anywhere',
        }}
      >
        {formula}
      </Text>
      {!isHidden && (
        <>
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
          {/* The warning line above already says that the name is hidden */}
          <FormulaWarnings
            issues={value.issues.filter(
              issue => !(issue.kind === 'shadowed' && issue.name === name),
            )}
          />
        </>
      )}
    </View>
  );
}
