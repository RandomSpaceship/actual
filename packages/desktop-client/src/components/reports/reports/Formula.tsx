import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Input } from '@actual-app/components/input';
import { Menu } from '@actual-app/components/menu';
import { Popover } from '@actual-app/components/popover';
import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Toggle } from '@actual-app/components/toggle';
import { View } from '@actual-app/components/view';
import { renameNamedFormulaInFormula } from '@actual-app/core/shared/formulas/namedFormulaNameUses';
import type {
  FormulaChartSettings,
  FormulaLibraryItemEntity,
  FormulaTableColumn,
  FormulaTableColumnType,
  FormulaTableHeader,
  FormulaTableTotals,
  FormulaWidget,
} from '@actual-app/core/types/models';
import type { EditorView } from '@codemirror/view';
import { useQuery } from '@tanstack/react-query';
import { isEqual } from 'es-toolkit/compat';

import { EditablePageHeaderTitle } from '#components/EditablePageHeaderTitle';
import { ColorFormulaResult } from '#components/formula/ColorFormulaResult';
import { maxShownTableColumns } from '#components/formula/executeFormula';
import {
  isFormulaValueFormattable,
  useFormulaValueFormatter,
} from '#components/formula/formatFormulaValue';
import { FormulaChart } from '#components/formula/FormulaChart';
import {
  getFormulaChartColumnRoles,
  getFormulaChartData,
  getFormulaChartIssues,
} from '#components/formula/formulaChartData';
import { FormulaChartSettingsForm } from '#components/formula/FormulaChartSettingsForm';
import {
  FormulaTable,
  getFormulaTableColumnNames,
  getFormulaTableColumnTypes,
  getFormulaTableUnformattableColumns,
  isFormulaTableHeaderRowShown,
} from '#components/formula/FormulaTable';
import { FormulaTableColumnSettings } from '#components/formula/FormulaTableColumnSettings';
import { FormulaWarnings } from '#components/formula/FormulaWarnings';
import { QueryManager } from '#components/formula/QueryManager';
import { listNamedFormulaNames } from '#components/formula/resolveNamedFormulas';
import type { CardNamedFormulas } from '#components/formula/resolveNamedFormulas';
import { listQueryNames } from '#components/formula/resolveQuery';
import type { FormulaIssue } from '#components/formula/resolveQuery';
import { MobileBackButton } from '#components/mobile/MobileBackButton';
import { MobilePageHeader, Page, PageHeader } from '#components/Page';
import { FormulaResult } from '#components/reports/FormulaResult';
import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import { formulaLibraryQueries } from '#formula-library';
import { useAccounts } from '#hooks/useAccounts';
import { useCategories } from '#hooks/useCategories';
import { useDashboardWidget } from '#hooks/useDashboardWidget';
import { useFormulaExecution } from '#hooks/useFormulaExecution';
import { useNavigate } from '#hooks/useNavigate';
import { useThemeColors } from '#hooks/useThemeColors';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';
import { useUpdateDashboardWidgetMutation } from '#reports/mutations';

const FormulaEditor = lazy(() =>
  import('#components/formula/FormulaEditor').then(module => ({
    default: module.FormulaEditor,
  })),
);

// A stable identity, so the editor does not rebuild while the library loads
const EMPTY_LIBRARY: FormulaLibraryItemEntity[] = [];

export function Formula() {
  const params = useParams();
  const { data: widget, isPending } = useDashboardWidget<FormulaWidget>({
    id: params.id,
    type: 'formula-card',
  });

  if (isPending) {
    return <LoadingIndicator />;
  }

  return <FormulaInner widget={widget} />;
}

type FormulaInnerProps = {
  widget?: FormulaWidget;
};

function FormulaInner({ widget }: FormulaInnerProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isNarrowWidth } = useResponsive();
  const themeColors = useThemeColors();

  const [queries, setQueries] = useState(widget?.meta?.queries || {});
  const [timeFrameOverrides, setTimeFrameOverrides] = useState(
    widget?.meta?.timeFrameOverrides || {},
  );
  const [cardNamedFormulas, setCardNamedFormulas] = useState<CardNamedFormulas>(
    widget?.meta?.namedFormulas || {},
  );
  const {
    data: { list: categories, grouped: categoryGroups } = {
      list: [],
      grouped: [],
    },
  } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const library = useQuery(formulaLibraryQueries.list()).data ?? EMPTY_LIBRARY;

  const [formula, setFormula] = useState(
    widget?.meta?.formula || '=SUM(1, 2, 3)',
  );

  const [fontSizeMode, setFontSizeMode] = useState<'dynamic' | 'static'>(
    widget?.meta?.fontSizeMode || 'dynamic',
  );
  const [staticFontSize, setStaticFontSize] = useState<number>(
    widget?.meta?.staticFontSize || 32,
  );
  const [showTitle, setShowTitle] = useState(widget?.meta?.showTitle ?? true);
  const [colorFormula, setColorFormula] = useState(
    widget?.meta?.colorFormula || '',
  );
  const [valueFormat, setValueFormat] = useState<
    'auto' | FormulaTableColumnType
  >(widget?.meta?.valueFormat ?? 'auto');
  const colorPresetTriggerRef = useRef<HTMLButtonElement>(null);
  const [isColorPresetMenuOpen, setIsColorPresetMenuOpen] = useState(false);
  const [view, setView] = useState<'auto' | 'number' | 'table' | 'chart'>(
    widget?.meta?.view ?? 'auto',
  );
  const [chartSettings, setChartSettings] = useState<FormulaChartSettings>(
    widget?.meta?.chart ?? {},
  );
  const [tableColumns, setTableColumns] = useState<FormulaTableColumn[]>(
    widget?.meta?.tableColumns ?? [],
  );
  const [tableHeader, setTableHeader] = useState<FormulaTableHeader>(
    widget?.meta?.tableHeader ?? 'auto',
  );
  const [tableTotals, setTableTotals] = useState<FormulaTableTotals>(
    widget?.meta?.tableTotals ?? 'none',
  );

  // The inputs of the last run. They follow your changes until a run gives a
  // large table. Then only Run, Ctrl+Enter and Save update them, so that a
  // formula that is half typed does not start another slow query.
  const [ranInputs, setRanInputs] = useState(() => ({
    formula,
    colorFormula,
    queries,
    timeFrameOverrides,
    cardNamedFormulas,
  }));
  function runFormula() {
    setRanInputs({
      formula,
      colorFormula,
      queries,
      timeFrameOverrides,
      cardNamedFormulas,
    });
  }
  // The settings that Save widget writes
  const editedMeta = {
    formula,
    queries,
    timeFrameOverrides,
    namedFormulas: cardNamedFormulas,
    fontSizeMode,
    staticFontSize,
    showTitle,
    colorFormula,
    valueFormat,
    view,
    tableColumns,
    tableHeader,
    tableTotals,
    chart: chartSettings,
  };
  const [savedMeta, setSavedMeta] = useState(editedMeta);
  // A click that opens transactions leaves the page, and the changes would
  // be lost
  const hasUnsavedChanges = !isEqual(editedMeta, savedMeta);
  const isChanged =
    formula !== ranInputs.formula ||
    colorFormula !== ranInputs.colorFormula ||
    JSON.stringify(queries) !== JSON.stringify(ranInputs.queries) ||
    JSON.stringify(timeFrameOverrides) !==
      JSON.stringify(ranInputs.timeFrameOverrides) ||
    JSON.stringify(cardNamedFormulas) !==
      JSON.stringify(ranInputs.cardNamedFormulas);

  const title = widget?.meta?.name || t('Formula');

  const simpleAccounts = useMemo(
    () =>
      accounts
        .filter(account => !account.tombstone)
        .map(account => ({ id: account.id, name: account.name })),
    [accounts],
  );

  const {
    result,
    table,
    spills,
    sourceMap,
    isLoading: isExecuting,
    error,
    issues,
  } = useFormulaExecution(
    ranInputs.formula,
    ranInputs.queries,
    undefined,
    undefined,
    simpleAccounts,
    ranInputs.timeFrameOverrides,
    view === 'auto' ? 'auto' : view === 'number' ? 'value' : 'table',
    ranInputs.cardNamedFormulas,
  );
  const isManualRun = issues.some(
    issue => issue.kind === 'large-table' || issue.kind === 'table-cut',
  );
  if (!isManualRun && isChanged) {
    // A state update in render, as React allows for state that follows other
    // state. React renders again before it shows the page.
    runFormula();
  }
  const isTableView = view === 'table' || (view === 'auto' && table !== null);
  const isChartView = view === 'chart';
  const isHeaderRowShown = isFormulaTableHeaderRowShown(
    table ?? [],
    tableHeader,
  );
  const isHeaderRowFound = isFormulaTableHeaderRowShown(table ?? [], 'auto');

  // A value that does not fit its format shows as the formula gives it
  const formatNames: Record<FormulaTableColumnType, string> = {
    money: t('Money'),
    percent: t('Percent'),
    number: t('Number'),
    date: t('Date'),
    text: t('Text'),
  };
  const formatIssues: FormulaIssue[] =
    isTableView || isChartView
      ? getFormulaTableUnformattableColumns(
          table ?? [],
          tableColumns,
          isHeaderRowShown,
        ).map(columnIndex => {
          const format = formatNames[tableColumns[columnIndex]?.type ?? 'text'];
          return {
            severity: 'warning',
            kind: 'unformattable',
            name: String(columnIndex + 1),
            message: t(
              'The {{format}} format cannot show some values in column {{columnNumber}}. They show as the formula gives them.',
              { columnNumber: columnIndex + 1, format },
            ),
          };
        })
      : valueFormat !== 'auto' &&
          !error &&
          !isFormulaValueFormattable(result, valueFormat)
        ? [
            {
              severity: 'warning',
              kind: 'unformattable',
              name: '',
              message: t(
                'The {{format}} format cannot show this result, so it shows as the formula gives it.',
                { format: formatNames[valueFormat] },
              ),
            },
          ]
        : [];

  const formatFormulaValue = useFormulaValueFormatter();
  const chart = getFormulaChartData(
    table ?? [],
    tableColumns,
    isHeaderRowShown,
    chartSettings,
    formatFormulaValue,
  );
  const chartIssues =
    isChartView && table && !error
      ? getFormulaChartIssues(chart.warnings, t)
      : [];
  const columnNames = getFormulaTableColumnNames(
    table ?? [],
    tableColumns,
    isHeaderRowShown,
  ).slice(0, maxShownTableColumns);
  const automaticColumnTypes = getFormulaTableColumnTypes(
    table ?? [],
    [],
    isHeaderRowShown,
  );

  const colorVariables = useMemo(
    () => ({
      RESULT: result ?? 0,
      ...Object.entries(themeColors).reduce(
        (acc, [key, value]) => {
          acc[`theme_${key}`] = value;
          return acc;
        },
        {} as Record<string, string>,
      ),
    }),
    [result, themeColors],
  );
  const categoryBadges = useMemo(() => {
    const categoryGroupNames = Object.fromEntries(
      categoryGroups.map(group => [group.id, group.name]),
    );

    return Object.fromEntries(
      categories
        .filter(category => !category.tombstone && !category.hidden)
        .map(category => {
          const groupName = categoryGroupNames[category.group];
          return [
            category.id,
            groupName ? `${groupName} -> ${category.name}` : category.name,
          ];
        }),
    );
  }, [categories, categoryGroups]);
  const {
    result: colorResult,
    error: colorError,
    issues: colorIssues,
  } = useFormulaExecution(
    // The table and chart views have no colour
    isTableView || isChartView ? '' : ranInputs.colorFormula,
    ranInputs.queries,
    undefined,
    colorVariables,
    simpleAccounts,
    ranInputs.timeFrameOverrides,
    'value',
    ranInputs.cardNamedFormulas,
  );

  // For autocomplete and badges: card queries and library queries
  const queryNames = useMemo(
    () => listQueryNames({ localQueries: queries, library }),
    [queries, library],
  );
  const namedFormulaNames = useMemo(
    () => listNamedFormulaNames(library, cardNamedFormulas),
    [library, cardNamedFormulas],
  );

  const formulaEditorViewRef = useRef<EditorView | null>(null);
  // Before the first focus, the cursor is at the start of the formula
  const hasFormulaEditorFocusRef = useRef(false);
  function insertIntoFormula(text: string) {
    const view = formulaEditorViewRef.current;
    if (!view) {
      setFormula(formula + text);
      return;
    }
    if (hasFormulaEditorFocusRef.current) {
      view.dispatch(view.state.replaceSelection(text));
    } else {
      const end = view.state.doc.length;
      view.dispatch({
        changes: { from: end, insert: text },
        selection: { anchor: end + text.length },
      });
    }
    view.focus();
  }

  const updateDashboardWidgetMutation = useUpdateDashboardWidgetMutation();

  const onSaveWidgetName = async (newName: string) => {
    if (!widget) {
      dispatch(
        addNotification({
          notification: {
            type: 'error',
            message: t('Cannot save: No widget available.'),
          },
        }),
      );
      return;
    }

    const name = newName || t('Formula');
    updateDashboardWidgetMutation.mutate({
      widget: {
        id: widget.id,
        meta: {
          ...(widget.meta ?? {}),
          name,
          formula,
          queries,
          timeFrameOverrides,
          namedFormulas: cardNamedFormulas,
          fontSizeMode,
          staticFontSize,
          showTitle,
          colorFormula,
          valueFormat,
          view,
          tableColumns,
          tableHeader,
          tableTotals,
          chart: chartSettings,
        },
      },
    });
  };

  async function onSaveWidget() {
    if (!widget) {
      dispatch(
        addNotification({
          notification: {
            type: 'error',
            message: t('Cannot save: No widget available.'),
          },
        }),
      );
      return;
    }

    // The editor then shows the result of the saved formula
    runFormula();
    setSavedMeta(editedMeta);
    updateDashboardWidgetMutation.mutate(
      {
        widget: {
          id: widget.id,
          meta: { ...(widget.meta ?? {}), ...editedMeta },
        },
      },
      {
        onSuccess: () => {
          dispatch(
            addNotification({
              notification: {
                type: 'message',
                message: t('Dashboard widget successfully saved.'),
              },
            }),
          );
        },
      },
    );
  }

  // Determine the custom color from color formula result
  const customColor =
    colorFormula && !colorError && colorResult ? String(colorResult) : null;

  return (
    <Page
      header={
        isNarrowWidth ? (
          <MobilePageHeader
            title={title}
            leftContent={
              <MobileBackButton onPress={() => navigate('/reports')} />
            }
          />
        ) : (
          <PageHeader
            title={
              widget ? (
                <EditablePageHeaderTitle
                  title={title}
                  onSave={onSaveWidgetName}
                />
              ) : (
                title
              )
            }
          />
        )
      }
      padding={0}
    >
      {widget && (
        <View
          style={{
            padding: 20,
            display: 'flex',
            justifyContent: 'flex-end',
            flexDirection: 'row',
            background: theme.pageBackground,
          }}
        >
          <Button
            variant="primary"
            onPress={onSaveWidget}
            style={{ width: 100 }}
          >
            <Trans>Save widget</Trans>
          </Button>
        </View>
      )}
      <View
        style={{
          width: '100%',
          height: '100%',
          background: theme.pageBackground,
          display: 'flex',
          flexDirection: 'row',
        }}
      >
        <View
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            // A table with many columns has many column settings. The pane
            // scrolls, so that no section shrinks over another.
            overflowY: 'auto',
            minHeight: 0,
          }}
        >
          <View
            style={{
              padding: 20,
              paddingBottom: 0,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 20,
              flexShrink: 0,
            }}
          >
            <View>
              <div
                style={{
                  fontSize: 13,
                  color: theme.pageTextSubdued,
                  marginBottom: 5,
                }}
              >
                <label htmlFor="formula-show-title">
                  <Trans>Show title:</Trans>
                </label>
              </div>
              <Toggle
                id="formula-show-title"
                isOn={showTitle}
                onToggle={setShowTitle}
              />
            </View>
            <View>
              <div
                style={{
                  fontSize: 13,
                  color: theme.pageTextSubdued,
                  marginBottom: 5,
                }}
              >
                <Trans>Display:</Trans>
              </div>
              <Select
                value={view}
                onChange={(value: 'auto' | 'number' | 'table' | 'chart') =>
                  setView(value)
                }
                options={[
                  [
                    'auto',
                    spills
                      ? t('Automatic (table)')
                      : t('Automatic (one value)'),
                  ],
                  ['number', t('One value')],
                  ['table', t('Table')],
                  ['chart', t('Chart')],
                ]}
              />
            </View>
          </View>
          <View
            style={{
              padding: 20,
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 10,
              minHeight: 120,
              flexShrink: 0,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  color: theme.pageTextSubdued,
                }}
              >
                <Trans>Result:</Trans>
              </div>
              <View style={{ flex: 1 }} />
              {isManualRun && (
                <div style={{ fontSize: 13, color: theme.pageTextSubdued }}>
                  {isChanged ? (
                    <Trans>
                      Changed. The table is large, so it updates only when you
                      select Run or press Ctrl+Enter.
                    </Trans>
                  ) : (
                    <Trans>
                      The table is large, so it updates only when you select Run
                      or press Ctrl+Enter.
                    </Trans>
                  )}
                </div>
              )}
              {isManualRun && (
                <Button
                  variant={isChanged ? 'primary' : 'normal'}
                  onPress={runFormula}
                >
                  <Trans>Run</Trans>
                </Button>
              )}
            </View>
            <View
              style={{
                height: isChartView ? 300 : isTableView ? 240 : 120,
                width: '100%',
                overflow: 'auto',
                backgroundColor: theme.cardBackground,
                borderRadius: 6,
                ...styles.horizontalScrollbar,
                '::-webkit-scrollbar': {
                  height: '8px',
                },
              }}
            >
              {isChartView && table && !error ? (
                <FormulaChart
                  chart={chart}
                  sourceMap={hasUnsavedChanges ? null : sourceMap}
                  style={{ padding: 10 }}
                />
              ) : isTableView && table && !error ? (
                <FormulaTable
                  table={table}
                  columns={tableColumns}
                  headerRow={isHeaderRowShown}
                  totals={tableTotals}
                  style={{ flex: 1, padding: 10 }}
                />
              ) : (
                <FormulaResult
                  value={result}
                  error={error}
                  loading={isExecuting}
                  fontSizeMode={fontSizeMode}
                  staticFontSize={staticFontSize}
                  customColor={customColor}
                  valueFormat={valueFormat}
                />
              )}
            </View>
            <FormulaWarnings
              issues={[
                ...issues,
                ...colorIssues,
                ...formatIssues,
                ...chartIssues,
              ]}
            />
          </View>
          <View
            style={{
              flex: 1,
              minHeight: 150,
              flexShrink: 0,
              margin: 20,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: theme.pageTextSubdued,
                marginBottom: 5,
              }}
            >
              <Trans>Formula:</Trans>
            </div>
            <Suspense fallback={<div style={{ padding: 10 }}>Loading...</div>}>
              <FormulaEditor
                value={formula}
                onChange={setFormula}
                mode="query"
                queries={queryNames}
                namedFormulas={namedFormulaNames}
                categoryBadges={categoryBadges}
                singleLine={false}
                showLineNumbers
                onRun={runFormula}
                onCreateEditor={view => {
                  formulaEditorViewRef.current = view;
                  view.contentDOM.addEventListener('focus', () => {
                    hasFormulaEditorFocusRef.current = true;
                  });
                }}
              />
            </Suspense>
          </View>
          {isChartView ? (
            <View
              style={{ padding: '0 20px 20px 20px', flexShrink: 0, gap: 20 }}
            >
              <FormulaChartSettingsForm
                settings={chartSettings}
                onChange={setChartSettings}
              />
              <FormulaTableColumnSettings
                columnCount={columnNames.length}
                columns={tableColumns}
                onChange={setTableColumns}
                header={tableHeader}
                onHeaderChange={setTableHeader}
                isHeaderRowShown={isHeaderRowShown}
                isHeaderRowFound={isHeaderRowFound}
                headerRowNames={getFormulaTableColumnNames(
                  table ?? [],
                  [],
                  true,
                )}
                automaticTypes={automaticColumnTypes}
                chartRoles={{
                  automaticRoles: getFormulaChartColumnRoles(
                    chart,
                    columnNames.length,
                  ),
                  isDonut: chart.type === 'donut',
                }}
              />
            </View>
          ) : isTableView ? (
            <View style={{ padding: '0 20px 20px 20px', flexShrink: 0 }}>
              <FormulaTableColumnSettings
                columnCount={Math.min(
                  table?.[0]?.length ?? 0,
                  maxShownTableColumns,
                )}
                columns={tableColumns}
                onChange={setTableColumns}
                header={tableHeader}
                onHeaderChange={setTableHeader}
                isHeaderRowShown={isHeaderRowShown}
                isHeaderRowFound={isHeaderRowFound}
                totals={tableTotals}
                onTotalsChange={setTableTotals}
                headerRowNames={getFormulaTableColumnNames(
                  table ?? [],
                  [],
                  true,
                )}
                automaticTypes={automaticColumnTypes}
              />
            </View>
          ) : (
            <>
              <View
                style={{
                  padding: '0 20px 20px 20px',
                  display: 'flex',
                  flexDirection: 'row',
                  gap: 20,
                  alignItems: 'flex-end',
                }}
              >
                <View>
                  <div
                    style={{
                      fontSize: 13,
                      color: theme.pageTextSubdued,
                      marginBottom: 5,
                    }}
                  >
                    <Trans>Format:</Trans>
                  </div>
                  <Select
                    value={valueFormat}
                    onChange={(value: 'auto' | FormulaTableColumnType) =>
                      setValueFormat(value)
                    }
                    options={[
                      [
                        'auto',
                        t('Automatic ({{type}})', {
                          type:
                            typeof result === 'number'
                              ? formatNames.money
                              : formatNames.text,
                        }),
                      ],
                      ['money', formatNames.money],
                      ['percent', formatNames.percent],
                      ['number', formatNames.number],
                      ['date', formatNames.date],
                      ['text', formatNames.text],
                    ]}
                  />
                </View>
                <View>
                  <div
                    style={{
                      fontSize: 13,
                      color: theme.pageTextSubdued,
                      marginBottom: 5,
                    }}
                  >
                    <Trans>Font size:</Trans>
                  </div>
                  <Select
                    value={fontSizeMode}
                    onChange={(value: 'dynamic' | 'static') =>
                      setFontSizeMode(value)
                    }
                    options={[
                      ['dynamic', t('Dynamic')],
                      ['static', t('Static')],
                    ]}
                  />
                </View>

                {fontSizeMode === 'static' && (
                  <View>
                    <div
                      style={{
                        fontSize: 13,
                        color: theme.pageTextSubdued,
                        marginBottom: 5,
                      }}
                    >
                      <Trans>Font size (px):</Trans>
                    </div>
                    <Input
                      type="number"
                      value={String(staticFontSize)}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setStaticFontSize(Number(e.target.value))
                      }
                    />
                  </View>
                )}
              </View>
              <View
                style={{
                  padding: 20,
                  marginBottom: 20,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 5,
                  }}
                >
                  <div style={{ fontSize: 13, color: theme.pageTextSubdued }}>
                    <Trans>Conditional color (optional):</Trans>
                  </div>
                  <Button
                    ref={colorPresetTriggerRef}
                    variant="bare"
                    onPress={() => setIsColorPresetMenuOpen(true)}
                  >
                    <Trans>Presets</Trans>
                  </Button>
                  <Popover
                    triggerRef={colorPresetTriggerRef}
                    placement="bottom end"
                    isOpen={isColorPresetMenuOpen}
                    onOpenChange={() => setIsColorPresetMenuOpen(false)}
                  >
                    <Menu
                      onMenuSelect={presetName => {
                        setColorFormula(colorPresets[presetName] ?? '');
                        setIsColorPresetMenuOpen(false);
                      }}
                      items={[
                        {
                          name: 'sign',
                          text: t('Green above zero, red below zero'),
                        },
                        { name: 'negative', text: t('Red below zero') },
                        { name: 'positive', text: t('Green above zero') },
                        Menu.line,
                        { name: 'none', text: t('No color') },
                      ]}
                    />
                  </Popover>
                </View>
                <View
                  style={{
                    border: `1px solid ${theme.formInputBorder}`,
                    borderRadius: 4,
                    overflow: 'hidden',
                    backgroundColor: theme.tableBackground,
                  }}
                >
                  <Suspense fallback={<div style={{ height: 32 }} />}>
                    <FormulaEditor
                      value={colorFormula}
                      variables={colorVariables}
                      onChange={setColorFormula}
                      mode="query"
                      queries={queryNames}
                      namedFormulas={namedFormulaNames}
                      categoryBadges={categoryBadges}
                      singleLine
                      showLineNumbers={false}
                      onRun={runFormula}
                    />
                  </Suspense>
                </View>
                {ranInputs.colorFormula && (
                  <View style={{ marginTop: 5 }}>
                    <ColorFormulaResult
                      result={colorResult}
                      error={colorError}
                    />
                  </View>
                )}
                <div
                  style={{
                    fontSize: 11,
                    color: theme.pageTextSubdued,
                    marginTop: 5,
                  }}
                >
                  <Trans>
                    Formula that returns a color (e.g., &ldquo;red&rdquo;,
                    &ldquo;#ff0000&rdquo;). Leave blank for default. Use RESULT
                    variable to access the main formula result.
                  </Trans>
                </div>
              </View>
            </>
          )}
        </View>

        {/* A fixed width, so that a wide named formula table scrolls in its own
            box and does not make the column wider */}
        <View
          style={{
            width: 440,
            flexShrink: 0,
            overflowY: 'auto',
          }}
        >
          <QueryManager
            queries={queries}
            onQueriesChange={setQueries}
            timeFrameOverrides={timeFrameOverrides}
            onTimeFrameOverridesChange={setTimeFrameOverrides}
            cardNamedFormulas={cardNamedFormulas}
            onCardNamedFormulasChange={(newCardNamedFormulas, rename) => {
              setCardNamedFormulas(newCardNamedFormulas);
              if (rename) {
                setFormula(
                  renameNamedFormulaInFormula(
                    formula,
                    rename.oldName,
                    rename.newName,
                  ),
                );
                setColorFormula(
                  renameNamedFormulaInFormula(
                    colorFormula,
                    rename.oldName,
                    rename.newName,
                  ),
                );
              }
            }}
            formulas={[
              formula,
              colorFormula,
              ...Object.values(cardNamedFormulas).map(
                namedFormula => namedFormula.formula,
              ),
            ]}
            accounts={simpleAccounts}
            onInsertNamedFormula={insertIntoFormula}
          />
        </View>
      </View>
    </Page>
  );
}

// The colors of positive and negative amounts in the custom report table. An
// empty result gives the default color, because the color of 0 is too light
// on the light theme.
const colorPresets: Record<string, string> = {
  sign: '=IF(RESULT>0, theme_reportsNumberPositive, IF(RESULT<0, theme_reportsNumberNegative, ""))',
  negative: '=IF(RESULT<0, theme_reportsNumberNegative, "")',
  positive: '=IF(RESULT>0, theme_reportsNumberPositive, "")',
  none: '',
};
