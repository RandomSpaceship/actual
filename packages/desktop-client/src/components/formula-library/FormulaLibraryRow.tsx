import React from 'react';
import { Dialog, DialogTrigger } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgTrash } from '@actual-app/components/icons/v1';
import { Popover } from '@actual-app/components/popover';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import type { FormulaLibraryQueryEntity } from '@actual-app/core/types/models';

import { getTimeFrameModeLabels } from '#components/formula/queryTimeFrame';
import { ConditionExpression } from '#components/rules/ConditionExpression';
import { Cell, Field, Row } from '#components/table';
import { useDateFormat } from '#hooks/useDateFormat';
import { friendlyOp } from '#util/rule';

import type { FormulaQueryUse } from './formulaQueryUses';
import { FormulaQueryUsesList } from './FormulaQueryUsesList';

type FormulaLibraryRowProps = {
  item: FormulaLibraryQueryEntity;
  uses: FormulaQueryUse[];
  // Set when an older item has the same name
  isOverridden: boolean;
  onEdit: (item: FormulaLibraryQueryEntity) => void;
  onDelete: (item: FormulaLibraryQueryEntity) => void;
};

export function FormulaLibraryRow({
  item,
  uses,
  isOverridden,
  onEdit,
  onDelete,
}: FormulaLibraryRowProps) {
  const { t } = useTranslation();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const { description, conditions = [], conditionsOp, timeFrame } = item.data;

  const timeFrameMode = timeFrame?.mode ?? 'sliding-window';
  const timeFrameLabel = getTimeFrameModeLabels(t)[timeFrameMode];
  const dates =
    (timeFrameMode === 'static' || timeFrameMode === 'sliding-window') &&
    timeFrame?.start &&
    timeFrame?.end
      ? { start: timeFrame.start, end: timeFrame.end }
      : null;

  return (
    <Row
      height="auto"
      collapsed
      style={{ fontSize: 13, backgroundColor: theme.tableBackground }}
    >
      <Field width={200} truncate={false} style={{ padding: '10px 0' }}>
        <Button
          variant="bare"
          aria-label={t('Edit query {{name}}', { name: item.name })}
          onPress={() => onEdit(item)}
          style={{ justifyContent: 'flex-start', fontFamily: 'monospace' }}
        >
          {item.name}
        </Button>
        {isOverridden && (
          <Text style={{ color: theme.warningText, fontSize: 12 }}>
            <Trans>An older query has this name, so it is used instead</Trans>
          </Text>
        )}
      </Field>
      <Field width="flex" truncate={false} style={{ padding: '10px 0' }}>
        <Text style={{ color: theme.pageTextLight, overflowWrap: 'anywhere' }}>
          {description}
        </Text>
      </Field>
      <Field width="flex" truncate={false} style={{ padding: '10px 0' }}>
        {conditions.length === 0 ? (
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>All transactions</Trans>
          </Text>
        ) : (
          <View style={{ alignItems: 'flex-start' }}>
            {conditions.map((condition, index) => (
              <ConditionExpression
                key={index}
                field={condition.field}
                op={condition.op}
                inline
                value={condition.value}
                options={condition.options}
                prefix={
                  index > 0 ? friendlyOp(conditionsOp ?? 'and') : undefined
                }
                style={index !== 0 ? { marginTop: 3 } : undefined}
              />
            ))}
          </View>
        )}
      </Field>
      <Field width={180} truncate={false} style={{ padding: '10px 0' }}>
        <Text>{timeFrameLabel}</Text>
        {dates && (
          <Text style={{ color: theme.pageTextSubdued }}>
            {monthUtils.format(dates.start, dateFormat)} –{' '}
            {monthUtils.format(dates.end, dateFormat)}
          </Text>
        )}
      </Field>
      <Cell width={100} plain style={{ padding: '10px 5px' }}>
        {uses.length === 0 ? (
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>Not used</Trans>
          </Text>
        ) : (
          <DialogTrigger>
            <Button variant="bare">
              <Trans count={uses.length}>{{ count: uses.length }} cards</Trans>
            </Button>
            <Popover placement="bottom end">
              <Dialog
                aria-label={t('Cards that use {{name}}', { name: item.name })}
              >
                <View style={{ padding: 15, width: 400 }}>
                  <FormulaQueryUsesList uses={uses} />
                </View>
              </Dialog>
            </Popover>
          </DialogTrigger>
        )}
      </Cell>
      <Cell width={40} plain style={{ padding: '10px 5px' }}>
        <Button
          variant="bare"
          aria-label={t('Delete query {{name}}', { name: item.name })}
          onPress={() => onDelete(item)}
        >
          <SvgTrash style={{ width: 13, height: 13 }} />
        </Button>
      </Cell>
    </Row>
  );
}
