import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { FormulaLibraryProviderEntity } from '@actual-app/core/types/models';

import { Checkbox } from '#components/forms';

import type { FormulaQueryUse } from './formulaQueryUses';

type FormulaQueryUsesListProps = {
  uses: FormulaQueryUse[];
  providers?: FormulaLibraryProviderEntity[];
  // Shows a checkbox for each card
  checkedWidgetIds?: Set<string>;
  onCheckedChange?: (widgetId: string, checked: boolean) => void;
};

export function FormulaQueryUsesList({
  uses,
  providers = [],
  checkedWidgetIds,
  onCheckedChange,
}: FormulaQueryUsesListProps) {
  const { t } = useTranslation();

  return (
    <View style={{ gap: 10, maxHeight: 300, overflow: 'auto' }}>
      {providers.map(provider => (
        <View key={provider.id} style={{ minWidth: 0 }}>
          <Text>
            <Text style={{ color: theme.pageTextSubdued }}>
              <Trans>Provider</Trans>
              {' › '}
            </Text>
            <Text style={{ fontWeight: 600, fontFamily: 'monospace' }}>
              {provider.name}
            </Text>
          </Text>
          <Text
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              color: theme.pageTextLight,
              overflowWrap: 'anywhere',
            }}
          >
            {provider.data.formula}
          </Text>
        </View>
      ))}
      {uses.map(use => {
        const checkboxId = `formula-query-use-${use.widgetId}`;
        return (
          <View
            key={use.widgetId}
            style={{ flexDirection: 'row', alignItems: 'flex-start' }}
          >
            {checkedWidgetIds && (
              <Checkbox
                id={checkboxId}
                checked={checkedWidgetIds.has(use.widgetId)}
                onChange={event =>
                  onCheckedChange?.(use.widgetId, event.target.checked)
                }
                style={{ marginTop: 2 }}
              />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <label htmlFor={checkedWidgetIds ? checkboxId : undefined}>
                <Text style={{ color: theme.pageTextSubdued }}>
                  {use.dashboardName || t('Dashboard')}
                  {' › '}
                </Text>
                <Text style={{ fontWeight: 600 }}>
                  {use.cardName || t('Formula')}
                </Text>
              </label>
              {use.formulas.map(formula => (
                <Text
                  key={formula}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: theme.pageTextLight,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {formula}
                </Text>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
