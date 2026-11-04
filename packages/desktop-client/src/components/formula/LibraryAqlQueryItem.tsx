import React from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { FormulaLibraryAqlQueryEntity } from '@actual-app/core/types/models';

import {
  describeAqlQuery,
  getAqlQueryOneLine,
} from '#components/formula-library/aqlQueryKind';

type LibraryAqlQueryItemProps = {
  item: FormulaLibraryAqlQueryEntity;
  // Set when a card query with the same name hides this query
  isHidden: boolean;
  onEdit: () => void;
};

// A library AQL query in the card editor. The edit button opens the library
// editor, which changes the query for every card.
export function LibraryAqlQueryItem({
  item,
  isHidden,
  onEdit,
}: LibraryAqlQueryItemProps) {
  const { description, aql } = item.data;
  const { label, error } = describeAqlQuery(aql);

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
        <Button variant="bare" onPress={onEdit}>
          <Trans>Edit</Trans>
        </Button>
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
      <Text
        style={{
          fontFamily: 'monospace',
          fontSize: 12,
          color: theme.pageTextLight,
          overflowWrap: 'anywhere',
        }}
      >
        {getAqlQueryOneLine(aql)}
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: error === undefined ? theme.pageTextSubdued : theme.errorText,
        }}
      >
        <Trans>AQL query.</Trans> {error ?? label}
      </Text>
    </View>
  );
}
