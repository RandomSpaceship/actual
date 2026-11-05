import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgTrash } from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import type { FormulaLibraryNamedFormulaEntity } from '@actual-app/core/types/models';

import { Cell, Field, Row } from '#components/table';

import { FormulaLibraryUsesCell } from './FormulaLibraryUsesCell';
import type { FormulaQueryUse } from './formulaQueryUses';

type FormulaLibraryNamedFormulaRowProps = {
  item: FormulaLibraryNamedFormulaEntity;
  uses: {
    cards: FormulaQueryUse[];
    namedFormulas: FormulaLibraryNamedFormulaEntity[];
  };
  // Set when an older named formula has the same name
  isOverridden: boolean;
  onEdit: (item: FormulaLibraryNamedFormulaEntity) => void;
  onDelete: (item: FormulaLibraryNamedFormulaEntity) => void;
};

export function FormulaLibraryNamedFormulaRow({
  item,
  uses,
  isOverridden,
  onEdit,
  onDelete,
}: FormulaLibraryNamedFormulaRowProps) {
  const { t } = useTranslation();
  const { description, formula } = item.data;

  return (
    <Row
      height="auto"
      collapsed
      style={{ fontSize: 13, backgroundColor: theme.tableBackground }}
    >
      <Field width={200} truncate={false} style={{ padding: '10px 0' }}>
        <Button
          variant="bare"
          aria-label={t('Edit named formula {{name}}', { name: item.name })}
          onPress={() => onEdit(item)}
          style={{ justifyContent: 'flex-start', fontFamily: 'monospace' }}
        >
          {item.name}
        </Button>
        {isOverridden && (
          <Text style={{ color: theme.warningText, fontSize: 12 }}>
            <Trans>
              An older named formula has this name, so it is used instead
            </Trans>
          </Text>
        )}
      </Field>
      <Field width="flex" truncate={false} style={{ padding: '10px 0' }}>
        <Text style={{ color: theme.pageTextLight, overflowWrap: 'anywhere' }}>
          {description}
        </Text>
      </Field>
      <Field width="flex" truncate={false} style={{ padding: '10px 0' }}>
        <Text style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
          {formula}
        </Text>
      </Field>
      <FormulaLibraryUsesCell name={item.name} uses={uses} />
      <Cell width={40} plain style={{ padding: '10px 5px' }}>
        <Button
          variant="bare"
          aria-label={t('Delete named formula {{name}}', { name: item.name })}
          onPress={() => onDelete(item)}
        >
          <SvgTrash style={{ width: 13, height: 13 }} />
        </Button>
      </Cell>
    </Row>
  );
}
