import { Trans, useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  FormulaChartColumnRole,
  FormulaTableColumn,
  FormulaTableColumnType,
  FormulaTableHeader,
  FormulaTableTotals,
} from '@actual-app/core/types/models';

type FormulaTableColumnSettingsProps = {
  columnCount: number;
  columns: FormulaTableColumn[];
  onChange: (columns: FormulaTableColumn[]) => void;
  header: FormulaTableHeader;
  onHeaderChange: (header: FormulaTableHeader) => void;
  // The table shows its first row as the header row
  isHeaderRowShown: boolean;
  // The 'auto' setting finds a header row in the first row
  isHeaderRowFound: boolean;
  // Without these, the totals setting does not show. A chart has no totals.
  totals?: FormulaTableTotals;
  onTotalsChange?: (totals: FormulaTableTotals) => void;
  // The names in the first row, for the placeholders
  headerRowNames: string[];
  // The type of each column without a set type, for the automatic choice
  automaticTypes: FormulaTableColumnType[];
  // Chart view only: each row gets a role select
  chartRoles?: {
    // The role of each column in the chart now, for the automatic choice
    automaticRoles: FormulaChartColumnRole[];
    // A donut calls the series the outer ring
    isDonut: boolean;
  };
};

export function FormulaTableColumnSettings({
  columnCount,
  columns,
  onChange,
  header,
  onHeaderChange,
  isHeaderRowShown,
  isHeaderRowFound,
  totals,
  onTotalsChange,
  headerRowNames,
  automaticTypes,
  chartRoles,
}: FormulaTableColumnSettingsProps) {
  const { t } = useTranslation();

  const roleNames: Record<FormulaChartColumnRole, string> = {
    label: t('Label'),
    series: chartRoles?.isDonut ? t('Outer ring') : t('Series'),
    value: t('Value'),
    hidden: t('Not shown'),
  };
  function getRoleOptions(
    columnIndex: number,
  ): Array<[FormulaChartColumnRole | 'auto', string]> {
    return [
      [
        'auto',
        t('Automatic ({{role}})', {
          role: roleNames[chartRoles?.automaticRoles[columnIndex] ?? 'hidden'],
        }),
      ],
      ['label', roleNames.label],
      ['series', roleNames.series],
      ['value', roleNames.value],
      ['hidden', roleNames.hidden],
    ];
  }
  // A chart has one label column and one series column, so a column that
  // gets one of these roles takes it from the other columns
  function setColumnRole(
    columnIndex: number,
    chartRole: FormulaChartColumnRole | undefined,
  ) {
    const isSingleRole = chartRole === 'label' || chartRole === 'series';
    const updated = Array.from(
      { length: Math.max(columns.length, columnIndex + 1) },
      (_, index) => {
        const column = columns[index] ?? {};
        if (index === columnIndex) return { ...column, chartRole };
        return isSingleRole && column.chartRole === chartRole
          ? { ...column, chartRole: undefined }
          : column;
      },
    );
    onChange(updated);
  }

  const typeNames: Record<FormulaTableColumnType, string> = {
    money: t('Money'),
    percent: t('Percent'),
    number: t('Number'),
    date: t('Date'),
    text: t('Text'),
  };
  function getTypeOptions(
    columnIndex: number,
  ): Array<[FormulaTableColumnType | 'auto', string]> {
    return [
      [
        'auto',
        t('Automatic ({{type}})', {
          type: typeNames[automaticTypes[columnIndex] ?? 'text'],
        }),
      ],
      ['money', typeNames.money],
      ['percent', typeNames.percent],
      ['number', typeNames.number],
      ['date', typeNames.date],
      ['text', typeNames.text],
    ];
  }

  function updateColumn(columnIndex: number, change: FormulaTableColumn) {
    const updated = Array.from(
      { length: Math.max(columns.length, columnIndex + 1) },
      (_, index) => columns[index] ?? {},
    );
    updated[columnIndex] = { ...updated[columnIndex], ...change };
    onChange(updated);
  }

  const labelStyle = {
    fontSize: 13,
    color: theme.pageTextSubdued,
  };

  return (
    <View style={{ gap: 5 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 5,
        }}
      >
        <View style={labelStyle}>
          <Trans>Header row:</Trans>
        </View>
        <Select
          value={header}
          onChange={(value: FormulaTableHeader) => onHeaderChange(value)}
          options={[
            [
              'auto',
              isHeaderRowFound
                ? t('Automatic (first row)')
                : t('Automatic (column names)'),
            ],
            ['first-row', t('First row')],
            ['none', t('Column names only')],
          ]}
        />
        {totals && onTotalsChange && (
          <>
            <View style={{ ...labelStyle, marginLeft: 10 }}>
              <Trans>Totals:</Trans>
            </View>
            <Select
              value={totals}
              onChange={(value: FormulaTableTotals) => onTotalsChange(value)}
              options={[
                ['none', t('None')],
                ['row', t('Totals row')],
                ['column', t('Totals column')],
                ['both', t('Row and column')],
              ]}
            />
          </>
        )}
      </View>
      <View style={labelStyle}>
        <Trans>Columns:</Trans>
      </View>
      {columnCount === 0 && (
        <View style={{ ...labelStyle, fontSize: 12 }}>
          <Trans>The formula gives no columns.</Trans>
        </View>
      )}
      {Array.from({ length: columnCount }, (_, columnIndex) => {
        const column = columns[columnIndex] ?? {};
        const columnNumber = columnIndex + 1;
        return (
          <View
            key={columnIndex}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View style={{ ...labelStyle, width: 70, flexShrink: 0 }}>
              <Trans>Column {{ columnNumber }}</Trans>
            </View>
            <Input
              aria-label={t('Name of column {{columnNumber}}', {
                columnNumber,
              })}
              placeholder={
                (isHeaderRowShown && headerRowNames[columnIndex]) ||
                t('No name')
              }
              value={column.name ?? ''}
              onChangeValue={name => updateColumn(columnIndex, { name })}
              style={{ flex: 1, minWidth: 80, maxWidth: 240 }}
            />
            <Select
              value={column.type ?? 'auto'}
              onChange={(value: FormulaTableColumnType | 'auto') =>
                updateColumn(columnIndex, {
                  type: value === 'auto' ? undefined : value,
                })
              }
              options={getTypeOptions(columnIndex)}
            />
            {chartRoles && (
              <Select
                value={column.chartRole ?? 'auto'}
                onChange={(value: FormulaChartColumnRole | 'auto') =>
                  setColumnRole(
                    columnIndex,
                    value === 'auto' ? undefined : value,
                  )
                }
                options={getRoleOptions(columnIndex)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
