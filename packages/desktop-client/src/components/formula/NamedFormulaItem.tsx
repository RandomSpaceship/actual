import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgTrash } from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { amountToInteger } from '@actual-app/core/shared/util';
import type {
  FormulaLibraryNamedFormulaData,
  FormulaTimeFrameOverride,
} from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import type { SimpleAccount } from '#components/formula/executeFormula';
import type { CardNamedFormulas } from '#components/formula/resolveNamedFormulas';
import type { FormulaQueryConfig } from '#components/formula/resolveQuery';
import { useFormat } from '#hooks/useFormat';
import { useFormulaExecution } from '#hooks/useFormulaExecution';

import { FormulaTable } from './FormulaTable';
import { FormulaWarnings } from './FormulaWarnings';

// The panel shows many named formulas, so each one shows only the start of its table
const shownNamedFormulaTableRows = 10;

type NamedFormulaItemProps = {
  name: string;
  data: FormulaLibraryNamedFormulaData;
  // Set for a library named formula that a card named formula with the same name hides.
  // It then shows no value.
  isHidden?: boolean;
  // A short line under the name
  warning?: string;
  // The card queries, overrides and named formulas, so that the value is the value
  // on this card
  queries: Record<string, FormulaQueryConfig>;
  timeFrameOverrides: Record<string, FormulaTimeFrameOverride>;
  cardNamedFormulas: CardNamedFormulas;
  accounts: SimpleAccount[];
  onEdit: () => void;
  // Each button shows only when its handler is set
  onInsert?: () => void;
  onCopyIntoCard?: () => void;
  onMakeShared?: () => void;
  onRemove?: () => void;
};

// A card named formula or a library named formula in the card editor. For a library
// named formula, the edit button opens the library editor, which changes the
// named formula for every card.
export function NamedFormulaItem({
  name,
  data,
  isHidden = false,
  warning,
  queries,
  timeFrameOverrides,
  cardNamedFormulas,
  accounts,
  onEdit,
  onInsert,
  onCopyIntoCard,
  onMakeShared,
  onRemove,
}: NamedFormulaItemProps) {
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
    'auto',
    cardNamedFormulas,
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
              aria-label={t('Remove named formula')}
            >
              <SvgTrash style={{ width: 13, height: 13 }} />
            </Button>
          )}
        </View>
      </View>
      {isHidden && (
        <Text style={{ color: theme.warningText, fontSize: 12 }}>
          <Trans>
            A card named formula with this name hides this named formula
          </Trans>
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
            ) : value.table ? (
              <Text style={{ fontSize: 13 }}>
                <Trans count={value.table.length}>
                  A table with {{ count: value.table.length }} rows
                </Trans>
              </Text>
            ) : typeof value.result === 'number' ? (
              <FinancialText style={{ fontSize: 13 }}>
                {format(amountToInteger(value.result), 'financial')}
              </FinancialText>
            ) : (
              <Text style={{ fontSize: 13 }}>{value.result}</Text>
            )}
          </View>
          {value.table && !value.error && (
            <>
              <FormulaTable
                table={value.table.slice(0, shownNamedFormulaTableRows)}
                compact
              />
              {value.table.length > shownNamedFormulaTableRows && (
                <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
                  <Trans>
                    Shows the first {{ shown: shownNamedFormulaTableRows }} rows
                  </Trans>
                </Text>
              )}
            </>
          )}
          {/* The lines above already say that the name is hidden, and that
              the table shows only its first rows */}
          <FormulaWarnings
            issues={value.issues.filter(
              issue =>
                !(issue.kind === 'shadowed' && issue.name === name) &&
                issue.kind !== 'table-cut',
            )}
          />
        </>
      )}
    </View>
  );
}
