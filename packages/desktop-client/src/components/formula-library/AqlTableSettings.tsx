import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import {
  defaultAqlRowLimit,
  maxAqlRowLimit,
} from '@actual-app/core/shared/formulas/aqlQuery';
import type { AqlQueryColumn } from '@actual-app/core/shared/formulas/aqlQuery';

import { Checkbox, FormField, FormLabel } from '#components/forms';

type AqlTableSettingsProps = {
  // null: the select has a *, so the columns are not known before the query
  // runs
  columns: AqlQueryColumn[] | null;
  moneyColumns: string[];
  onMoneyColumnsChange: (moneyColumns: string[]) => void;
  // As typed. '' is the default.
  rowLimit: string;
  onRowLimitChange: (rowLimit: string) => void;
  rowLimitError: string | null;
};

// The settings of an AQL query that gives a table
export function AqlTableSettings({
  columns,
  moneyColumns,
  onMoneyColumnsChange,
  rowLimit,
  onRowLimitChange,
  rowLimitError,
}: AqlTableSettingsProps) {
  const { t } = useTranslation();

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 20,
        marginBottom: 10,
      }}
    >
      <FormField style={{ flex: 1, minWidth: 250 }}>
        <FormLabel title={t('Money columns')} />
        {columns ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              columnGap: 15,
              rowGap: 5,
            }}
          >
            {columns.map((column, columnIndex) => {
              const id = `formula-aql-money-${columnIndex}`;
              const isMoney = moneyColumns.includes(column.name);
              return (
                <View
                  key={column.name}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Checkbox
                    id={id}
                    checked={isMoney}
                    onChange={() =>
                      onMoneyColumnsChange(
                        isMoney
                          ? moneyColumns.filter(name => name !== column.name)
                          : [...moneyColumns, column.name],
                      )
                    }
                  />
                  <label
                    htmlFor={id}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  >
                    {column.name}
                  </label>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>
              The select has a *, so the fields named amount are money. Select
              the fields by name to choose the money columns.
            </Trans>
          </Text>
        )}
        <Text
          style={{ color: theme.pageTextSubdued, fontSize: 12, marginTop: 5 }}
        >
          <Trans>
            The database stores an amount in cents. A money column gives the
            amount, as QUERY does.
          </Trans>
        </Text>
      </FormField>
      <FormField style={{ width: 200 }}>
        <FormLabel title={t('Row limit')} htmlFor="formula-aql-row-limit" />
        <Input
          id="formula-aql-row-limit"
          inputMode="numeric"
          value={rowLimit}
          placeholder={String(defaultAqlRowLimit)}
          onChangeValue={onRowLimitChange}
        />
        <Text
          style={{
            color: rowLimitError ? theme.errorText : theme.pageTextSubdued,
            fontSize: 12,
            marginTop: 5,
          }}
        >
          {rowLimitError ??
            t(
              'Up to {{maxAqlRowLimit}}. A smaller limit in the query is used instead.',
              { maxAqlRowLimit: maxAqlRowLimit.toLocaleString() },
            )}
        </Text>
      </FormField>
    </View>
  );
}
