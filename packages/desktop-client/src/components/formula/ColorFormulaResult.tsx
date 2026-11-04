import React from 'react';
import { Trans } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

type ColorFormulaResultProps = {
  result: number | string | null;
  error: string | null;
};

// Shows what the conditional color formula gives, so that a mistake is easy to
// see. The card ignores an error or a value that is not a color.
export function ColorFormulaResult({ result, error }: ColorFormulaResultProps) {
  if (error) {
    return (
      <Text style={{ fontSize: 12, color: theme.errorText }}>
        <Trans>Color error: {{ error }}</Trans>
      </Text>
    );
  }

  if (result === null || result === '') {
    return null;
  }

  const value = String(result);
  if (!CSS.supports('color', value)) {
    return (
      <Text style={{ fontSize: 12, color: theme.warningText }}>
        <Trans>
          This is not a color, so the card uses the default color: {{ value }}
        </Trans>
      </Text>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 2,
          backgroundColor: value,
          border: `1px solid ${theme.tableBorder}`,
          flexShrink: 0,
        }}
      />
      <Text style={{ fontSize: 12, color: theme.pageText }}>
        <Trans>Color: {{ value }}</Trans>
      </Text>
    </View>
  );
}
