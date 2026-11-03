import { Trans, useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { theme } from '@actual-app/components/theme';
import { Toggle } from '@actual-app/components/toggle';
import { View } from '@actual-app/components/view';
import type {
  FormulaTableColumn,
  FormulaTableColumnType,
} from '@actual-app/core/types/models';

type FormulaTableColumnSettingsProps = {
  columnCount: number;
  columns: FormulaTableColumn[];
  onChange: (columns: FormulaTableColumn[]) => void;
  headerRow: boolean;
  onHeaderRowChange: (headerRow: boolean) => void;
  // The names in the first row, for the placeholders
  headerRowNames: string[];
};

export function FormulaTableColumnSettings({
  columnCount,
  columns,
  onChange,
  headerRow,
  onHeaderRowChange,
  headerRowNames,
}: FormulaTableColumnSettingsProps) {
  const { t } = useTranslation();

  const typeOptions: Array<[FormulaTableColumnType | 'auto', string]> = [
    ['auto', t('Automatic')],
    ['money', t('Money')],
    ['percent', t('Percent')],
    ['number', t('Number')],
    ['date', t('Date')],
    ['text', t('Text')],
  ];

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
          gap: 10,
          marginBottom: 5,
        }}
      >
        <label htmlFor="formula-table-header-row" style={labelStyle}>
          <Trans>First row is the header:</Trans>
        </label>
        <Toggle
          id="formula-table-header-row"
          isOn={headerRow}
          onToggle={onHeaderRowChange}
        />
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
                (headerRow && headerRowNames[columnIndex]) || t('No name')
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
              options={typeOptions}
            />
          </View>
        );
      })}
      <View style={{ ...labelStyle, fontSize: 11 }}>
        <Trans>
          Automatic shows a column of numbers as money, and other columns as
          text. A table without column names has no header row. A name that you
          type replaces the name in the first row.
        </Trans>
      </View>
    </View>
  );
}
