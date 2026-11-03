import React from 'react';

import { SvgAlertTriangle } from '@actual-app/components/icons/v2';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import type { FormulaIssue } from './resolveQuery';

type FormulaWarningsProps = {
  issues: FormulaIssue[];
};

// Shows the warnings of a formula as short lines. Errors are not shown here,
// because an error replaces the value.
export function FormulaWarnings({ issues }: FormulaWarningsProps) {
  // The formula and the color formula can give the same warning
  const messages = [
    ...new Set(
      issues
        .filter(issue => issue.severity === 'warning')
        .map(issue => issue.message),
    ),
  ];

  if (messages.length === 0) {
    return null;
  }

  return (
    <View style={{ padding: '0 10px 8px', gap: 2, flexShrink: 0 }}>
      {messages.map(message => (
        <View
          key={message}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
        >
          <SvgAlertTriangle
            width={11}
            height={11}
            style={{ color: theme.warningText, flexShrink: 0 }}
          />
          <Text
            style={{
              color: theme.warningText,
              fontSize: 11,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {message}
          </Text>
        </View>
      ))}
    </View>
  );
}
