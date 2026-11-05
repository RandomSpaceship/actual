import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Select } from '@actual-app/components/select';
import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Toggle } from '@actual-app/components/toggle';
import { View } from '@actual-app/components/view';
import type {
  FormulaChartSettings,
  FormulaChartType,
} from '@actual-app/core/types/models';

import { Checkbox } from '#components/forms';

import { noSeriesColumn, rowNumberLabelColumn } from './formulaChartData';
import type { FormulaChartData } from './formulaChartData';

type FormulaChartSettingsFormProps = {
  settings: FormulaChartSettings;
  onChange: (settings: FormulaChartSettings) => void;
  // The chart that the settings give now, to show the automatic choices
  chart: FormulaChartData;
  // The name of each column, or an empty string
  columnNames: string[];
};

const automaticLabelColumn = 'auto';
const automaticSeriesColumn = 'auto';

export function FormulaChartSettingsForm({
  settings,
  onChange,
  chart,
  columnNames,
}: FormulaChartSettingsFormProps) {
  const { t } = useTranslation();

  function getColumnName(columnIndex: number) {
    const columnNumber = columnIndex + 1;
    return columnNames[columnIndex]
      ? t('Column {{columnNumber}}: {{name}}', {
          columnNumber,
          name: columnNames[columnIndex],
        })
      : t('Column {{columnNumber}}', { columnNumber });
  }
  function getLabelColumnName(labelColumn: number) {
    return labelColumn === rowNumberLabelColumn
      ? t('Row numbers')
      : getColumnName(labelColumn);
  }

  function getSeriesColumnName(seriesColumn: number) {
    return seriesColumn === noSeriesColumn
      ? t('None')
      : getColumnName(seriesColumn);
  }

  const type = settings.type ?? 'bar';
  const canStack = type === 'bar' || type === 'area';
  // A long table has one series for each series value, but one value column
  const shownValueColumns = [
    ...new Set(chart.series.map(series => series.columnIndex)),
  ];
  function setValueColumn(columnIndex: number, isShown: boolean) {
    const valueColumns = isShown
      ? [...shownValueColumns, columnIndex].sort((a, b) => a - b)
      : shownValueColumns.filter(shown => shown !== columnIndex);
    onChange({ ...settings, valueColumns });
  }

  const labelStyle = {
    fontSize: 13,
    color: theme.pageTextSubdued,
  };
  const toggleStyle: CSSProperties = {
    ...labelStyle,
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  };

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <View style={labelStyle}>
          <Trans>Chart:</Trans>
        </View>
        <Select
          value={type}
          onChange={(type: FormulaChartType) => onChange({ ...settings, type })}
          options={[
            ['bar', t('Bar')],
            ['line', t('Line')],
            ['area', t('Area')],
            ['donut', t('Donut')],
          ]}
        />
        <View style={{ ...labelStyle, marginLeft: 10 }}>
          <Trans>Labels:</Trans>
        </View>
        <Select
          value={
            settings.labelColumn === undefined
              ? automaticLabelColumn
              : String(settings.labelColumn)
          }
          onChange={(value: string) =>
            onChange({
              ...settings,
              labelColumn:
                value === automaticLabelColumn ? undefined : Number(value),
            })
          }
          options={[
            [
              automaticLabelColumn,
              t('Automatic ({{column}})', {
                column: getLabelColumnName(chart.labelColumn),
              }),
            ],
            [String(rowNumberLabelColumn), t('Row numbers')],
            ...columnNames.map(
              (_, columnIndex) =>
                [String(columnIndex), getColumnName(columnIndex)] as const,
            ),
          ]}
        />
        <View style={{ ...labelStyle, marginLeft: 10 }}>
          {type === 'donut' ? (
            <Trans>Outer ring:</Trans>
          ) : (
            <Trans>Series:</Trans>
          )}
        </View>
        <Select
          value={
            settings.seriesColumn === undefined
              ? automaticSeriesColumn
              : String(settings.seriesColumn)
          }
          onChange={(value: string) =>
            onChange({
              ...settings,
              seriesColumn:
                value === automaticSeriesColumn ? undefined : Number(value),
            })
          }
          options={[
            [
              automaticSeriesColumn,
              t('Automatic ({{column}})', {
                column: getSeriesColumnName(chart.seriesColumn),
              }),
            ],
            [String(noSeriesColumn), t('None')],
            ...columnNames.flatMap((_, columnIndex) =>
              columnIndex === chart.labelColumn
                ? []
                : [[String(columnIndex), getColumnName(columnIndex)] as const],
            ),
          ]}
        />
        {canStack && (
          <View style={toggleStyle}>
            <label htmlFor="formula-chart-stacked">
              <Trans>Stack:</Trans>
            </label>
            <Toggle
              id="formula-chart-stacked"
              isOn={settings.stacked ?? false}
              onToggle={stacked => onChange({ ...settings, stacked })}
            />
          </View>
        )}
        <View style={toggleStyle}>
          <label htmlFor="formula-chart-flip-sign">
            <Trans>Flip signs:</Trans>
          </label>
          <Toggle
            id="formula-chart-flip-sign"
            isOn={settings.flipSign ?? false}
            onToggle={flipSign => onChange({ ...settings, flipSign })}
          />
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <View style={labelStyle}>
          <Trans>Values:</Trans>
        </View>
        {columnNames.map((_, columnIndex) => {
          if (
            columnIndex === chart.labelColumn ||
            columnIndex === chart.seriesColumn
          ) {
            return null;
          }
          const checkboxId = `formula-chart-value-${columnIndex}`;
          return (
            <View
              key={columnIndex}
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              <Checkbox
                id={checkboxId}
                checked={shownValueColumns.includes(columnIndex)}
                onChange={event =>
                  setValueColumn(columnIndex, event.target.checked)
                }
              />
              <label htmlFor={checkboxId} style={{ fontSize: 13 }}>
                {getColumnName(columnIndex)}
              </label>
            </View>
          );
        })}
        {settings.valueColumns && (
          <Button
            variant="bare"
            onPress={() => onChange({ ...settings, valueColumns: undefined })}
          >
            <Trans>Automatic</Trans>
          </Button>
        )}
      </View>
    </View>
  );
}
