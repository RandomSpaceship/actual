import React from 'react';
import { Trans } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { FormulaLibraryQueryData } from '@actual-app/core/types/models';

import { ConditionExpression } from '#components/rules/ConditionExpression';
import { friendlyOp } from '#util/rule';

type QueryConditionsSummaryProps = Pick<
  FormulaLibraryQueryData,
  'conditions' | 'conditionsOp'
>;

export function QueryConditionsSummary({
  conditions = [],
  conditionsOp,
}: QueryConditionsSummaryProps) {
  if (conditions.length === 0) {
    return (
      <Text style={{ color: theme.pageTextSubdued }}>
        <Trans>All transactions</Trans>
      </Text>
    );
  }

  return (
    <View style={{ alignItems: 'flex-start' }}>
      {conditions.map((condition, index) => (
        <ConditionExpression
          key={index}
          field={condition.field}
          op={condition.op}
          inline
          value={condition.value}
          options={condition.options}
          prefix={index > 0 ? friendlyOp(conditionsOp ?? 'and') : undefined}
          style={index !== 0 ? { marginTop: 3 } : undefined}
        />
      ))}
    </View>
  );
}
