import React, { useEffect, useState } from 'react';
import { Trans } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { TimeFrame } from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import {
  fetchAqlQueryCount,
  fetchAqlQueryRows,
  fetchAqlQueryValue,
  FormulaQueryError,
  parseAqlConfig,
} from '#components/formula/aqlSource';
import { getQueryDateRange } from '#components/formula/executeFormula';
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
  | { kind: 'table'; table: FormulaTableCell[][] }
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

  useEffect(() => {
    let isCurrent = true;
    const timeout = setTimeout(() => {
      void runPreview(
        { text, dateField, isCount },
        timeFrameKey === undefined ? undefined : JSON.parse(timeFrameKey),
      ).then(result => {
        if (isCurrent) setPreview(result);
      });
    }, previewDelayMs);
    return () => {
      isCurrent = false;
      clearTimeout(timeout);
    };
  }, [text, dateField, isCount, timeFrameKey]);

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
        (preview.table.length <= 1 ? (
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>No rows</Trans>
          </Text>
        ) : (
          <View style={{ gap: 5 }}>
            <FormulaTable table={preview.table} headerRow compact />
            <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
              <Trans count={previewRowCount}>
                The first {{ count: previewRowCount }} rows, with the values as
                the database stores them (amounts in cents)
              </Trans>
            </Text>
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
        const rows = await fetchAqlQueryRows(aql, dateRange, previewRowCount);
        return { kind: 'table', table: toTable(rows) };
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

// A header row with the field names, then a row for each database row
function toTable(rows: Array<Record<string, unknown>>): FormulaTableCell[][] {
  const fields = Object.keys(rows[0] ?? {});
  return [fields, ...rows.map(row => fields.map(field => toCell(row[field])))];
}

function toCell(value: unknown): FormulaTableCell {
  if (value === null || value === undefined) return null;
  // Text, so that the table does not show cents as money
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}
