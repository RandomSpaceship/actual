import React from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Checkbox } from '#components/forms';

import type { FormulaQueryUse } from './formulaQueryUses';

type FormulaQueryUsesListProps = {
  uses: FormulaQueryUse[];
  // Shows a checkbox for each card
  checkedWidgetIds?: Set<string>;
  onCheckedChange?: (widgetId: string, checked: boolean) => void;
};

export function FormulaQueryUsesList({
  uses,
  checkedWidgetIds,
  onCheckedChange,
}: FormulaQueryUsesListProps) {
  const { t } = useTranslation();

  return (
    <View style={{ gap: 10, maxHeight: 300, overflow: 'auto' }}>
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
