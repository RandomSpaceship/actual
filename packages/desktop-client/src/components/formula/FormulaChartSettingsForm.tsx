import { Trans, useTranslation } from 'react-i18next';

import { Select } from '@actual-app/components/select';
import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Toggle } from '@actual-app/components/toggle';
import { View } from '@actual-app/components/view';
import type {
  FormulaChartSettings,
  FormulaChartType,
} from '@actual-app/core/types/models';

type FormulaChartSettingsFormProps = {
  settings: FormulaChartSettings;
  onChange: (settings: FormulaChartSettings) => void;
};

// The role of each column is in the column settings
export function FormulaChartSettingsForm({
  settings,
  onChange,
}: FormulaChartSettingsFormProps) {
  const { t } = useTranslation();

  const type = settings.type ?? 'bar';
  const canStack = type === 'bar' || type === 'area';

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
  );
}
