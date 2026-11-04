import React, { useEffect, useState } from 'react';
import { Trans } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  FormulaTableColumn,
  TimeFrame,
} from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import {
  fetchAqlQueryCount,
  fetchAqlQueryValue,
  FormulaQueryError,
  parseAqlConfig,
} from '#components/formula/aqlSource';
import {
  fetchQueryTable,
  getQueryDateRange,
} from '#components/formula/executeFormula';
import type { FormulaTableCell } from '#components/formula/executeFormula';
import { FormulaTable } from '#components/formula/FormulaTable';
import type { FormulaAqlConfig } from '#components/formula/resolveQuery';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';

const previewRowCount = 20;
// Wait for the typing to stop before the query runs
const previewDelayMs = 400;

type Preview =
  | { kind: 'filter'; sum: number; count: number }
  | { kind: 'value'; value: number; isAmount: boolean }
  | {
      kind: 'table';
      table: FormulaTableCell[][];
      columns: FormulaTableColumn[];
    }
  | { kind: 'error'; message: string };

type AqlQueryPreviewProps = {
  aql: FormulaAqlConfig;
  timeFrame?: Partial<TimeFrame>;
};

// The result of the query as you type it, before it is saved
export function AqlQueryPreview({ aql, timeFrame }: AqlQueryPreviewProps) {
  const format = useFormat();
  const [preview, setPreview] = useState<Preview | null>(null);
  const { text, dateField, isCount } = aql;
  const timeFrameKey = JSON.stringify(timeFrame);
  // Text, so that a new list with the same names does not run the query
  const moneyColumnsKey = JSON.stringify(aql.moneyColumns);

  useEffect(() => {
    let isCurrent = true;
    const timeout = setTimeout(() => {
      void runPreview(
        {
          text,
          dateField,
          isCount,
          moneyColumns:
            moneyColumnsKey === undefined
              ? undefined
              : JSON.parse(moneyColumnsKey),
        },
        timeFrameKey === undefined ? undefined : JSON.parse(timeFrameKey),
      ).then(result => {
        if (isCurrent) setPreview(result);
      });
    }, previewDelayMs);
    return () => {
      isCurrent = false;
      clearTimeout(timeout);
    };
  }, [text, dateField, isCount, timeFrameKey, moneyColumnsKey]);

  const boxStyle = {
    minHeight: 40,
    maxHeight: 220,
    overflow: 'auto',
    padding: 10,
    backgroundColor: theme.cardBackground,
    borderRadius: 6,
  };

  if (!preview) {
    return (
      <View style={boxStyle}>
        <Text style={{ color: theme.pageTextSubdued }}>
          <Trans>Loading...</Trans>
        </Text>
      </View>
    );
  }

  return (
    <View style={boxStyle}>
      {preview.kind === 'error' && (
        <Text style={{ color: theme.errorText, whiteSpace: 'pre-wrap' }}>
          {preview.message}
        </Text>
      )}
      {preview.kind === 'filter' && (
        <Text>
          <Trans count={preview.count}>
            The sum of {{ count: preview.count }} transactions:
          </Trans>{' '}
          <PrivacyFilter>
            <FinancialText>{format(preview.sum, 'financial')}</FinancialText>
          </PrivacyFilter>
        </Text>
      )}
      {preview.kind === 'value' && (
        <Text>
          {preview.isAmount ? (
            <PrivacyFilter>
              <FinancialText>
                {format(preview.value, 'financial')}
              </FinancialText>
            </PrivacyFilter>
          ) : (
            <FinancialText>{preview.value}</FinancialText>
          )}
        </Text>
      )}
      {preview.kind === 'table' &&
        (preview.table.length === 0 ? (
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>No rows</Trans>
          </Text>
        ) : (
          <View style={{ gap: 5 }}>
            <FormulaTable
              table={preview.table}
              columns={preview.columns}
              compact
            />
            {preview.table.length >= previewRowCount && (
              <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
                <Trans count={previewRowCount}>
                  The first {{ count: previewRowCount }} rows
                </Trans>
              </Text>
            )}
            {findIdColumns(preview).map(column => (
              <Text
                key={column}
                style={{ color: theme.warningText, fontSize: 12 }}
              >
                <Trans>
                  The column "{{ column }}" shows ids. To show names, select a
                  field of it, for example "{{ column }}.name".
                </Trans>
              </Text>
            ))}
          </View>
        ))}
    </View>
  );
}

async function runPreview(
  aql: FormulaAqlConfig,
  timeFrame: Partial<TimeFrame> | undefined,
): Promise<Preview> {
  try {
    const parsed = parseAqlConfig(aql);
    const dateRange = getQueryDateRange({ aql, timeFrame });
    switch (parsed.kind) {
      case 'filter': {
        const [{ value }, count] = await Promise.all([
          fetchAqlQueryValue(aql, dateRange),
          fetchAqlQueryCount(aql, dateRange),
        ]);
        return { kind: 'filter', sum: value, count };
      }
      case 'value': {
        const { value, isAmount } = await fetchAqlQueryValue(aql, dateRange);
        return { kind: 'value', value, isAmount };
      }
      default: {
        const { columns, rows, isMoneyColumn } = await fetchQueryTable(
          { aql, timeFrame },
          previewRowCount,
        );
        return {
          kind: 'table',
          table: rows,
          // Text, so that a number column such as a year does not show as
          // money or with a thousands separator
          columns: columns.map((name, columnIndex) => ({
            name,
            type: isMoneyColumn[columnIndex] ? 'money' : 'text',
          })),
        };
      }
    }
  } catch (error) {
    return {
      kind: 'error',
      message:
        error instanceof FormulaQueryError
          ? error.message
          : String(error instanceof Error ? error.message : error),
    };
  }
}

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A ref field such as category gives the id of the category. The id field of
// the table is not a ref.
function findIdColumns(preview: {
  table: FormulaTableCell[][];
  columns: FormulaTableColumn[];
}) {
  return preview.columns.flatMap((column, columnIndex) => {
    const name = column.name ?? '';
    if (name === 'id' || name.endsWith('.id')) return [];
    const values = preview.table
      .map(row => row[columnIndex])
      .filter(cell => cell !== null && cell !== '');
    return values.length > 0 &&
      values.every(cell => typeof cell === 'string' && idPattern.test(cell))
      ? [name]
      : [];
  });
}
