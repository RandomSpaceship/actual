import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Toggle } from '@actual-app/components/toggle';
import { View } from '@actual-app/components/view';
import type {
  FormulaLibraryItemEntity,
  FormulaTableColumn,
  FormulaTableHeader,
  FormulaTableTotals,
  FormulaWidget,
} from '@actual-app/core/types/models';
import type { EditorView } from '@codemirror/view';
import { useQuery } from '@tanstack/react-query';

import { EditablePageHeaderTitle } from '#components/EditablePageHeaderTitle';
import { maxShownTableColumns } from '#components/formula/executeFormula';
import {
  FormulaTable,
  getFormulaTableColumnNames,
  isFormulaTableHeaderRowShown,
} from '#components/formula/FormulaTable';
import { FormulaTableColumnSettings } from '#components/formula/FormulaTableColumnSettings';
import { FormulaWarnings } from '#components/formula/FormulaWarnings';
import { QueryManager } from '#components/formula/QueryManager';
import { listProviderNames } from '#components/formula/resolveProviders';
import { listQueryNames } from '#components/formula/resolveQuery';
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
  const [view, setView] = useState<'auto' | 'number' | 'table'>(
    widget?.meta?.view ?? 'auto',
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

  // The editor runs these inputs, not the inputs as you type them, so that
  // a formula that is half typed does not start a slow query. Run, Ctrl+Enter
  // and Save update them.
  const [ranInputs, setRanInputs] = useState(() => ({
    formula,
    colorFormula,
    queries,
    timeFrameOverrides,
  }));
  function runFormula() {
    setRanInputs({ formula, colorFormula, queries, timeFrameOverrides });
  }
  const isChanged =
    formula !== ranInputs.formula ||
    colorFormula !== ranInputs.colorFormula ||
    JSON.stringify(queries) !== JSON.stringify(ranInputs.queries) ||
    JSON.stringify(timeFrameOverrides) !==
      JSON.stringify(ranInputs.timeFrameOverrides);

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
    view === 'auto' ? 'auto' : view === 'table' ? 'table' : 'value',
  );
  const isTableView = view === 'table' || (view === 'auto' && table !== null);
  const isHeaderRowShown = isFormulaTableHeaderRowShown(
    table ?? [],
    tableHeader,
  );
  const isHeaderRowFound = isFormulaTableHeaderRowShown(table ?? [], 'auto');

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
    // The table view has no colour
    isTableView ? '' : ranInputs.colorFormula,
    ranInputs.queries,
    undefined,
    colorVariables,
    simpleAccounts,
    ranInputs.timeFrameOverrides,
  );

  // For autocomplete and badges: card queries and library queries
  const queryNames = useMemo(
    () => listQueryNames({ localQueries: queries, library }),
    [queries, library],
  );
  const providerNames = useMemo(() => listProviderNames(library), [library]);

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
          fontSizeMode,
          staticFontSize,
          showTitle,
          colorFormula,
          view,
          tableColumns,
          tableHeader,
          tableTotals,
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
    updateDashboardWidgetMutation.mutate(
      {
        widget: {
          id: widget.id,
          meta: {
            ...(widget.meta ?? {}),
            formula,
            queries,
            timeFrameOverrides,
            fontSizeMode,
            staticFontSize,
            showTitle,
            colorFormula,
            view,
            tableColumns,
            tableHeader,
            tableTotals,
          },
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
                onChange={(value: 'auto' | 'number' | 'table') =>
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
              {isChanged && (
                <div style={{ fontSize: 13, color: theme.pageTextSubdued }}>
                  <Trans>Changed. Select Run, or press Ctrl+Enter.</Trans>
                </div>
              )}
              <Button
                variant={isChanged ? 'primary' : 'normal'}
                onPress={runFormula}
              >
                <Trans>Run</Trans>
              </Button>
            </View>
            <View
              style={{
                height: isTableView ? 240 : 120,
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
              {isTableView && table && !error ? (
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
                />
              )}
            </View>
            <FormulaWarnings issues={[...issues, ...colorIssues]} />
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
                providers={providerNames}
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
          {isTableView ? (
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
                <div
                  style={{
                    fontSize: 13,
                    color: theme.pageTextSubdued,
                    marginBottom: 5,
                  }}
                >
                  <Trans>Conditional color (optional):</Trans>
                </div>
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
                      providers={providerNames}
                      categoryBadges={categoryBadges}
                      singleLine
                      showLineNumbers={false}
                      onRun={runFormula}
                    />
                  </Suspense>
                </View>
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

        <View
          style={{
            overflowY: 'auto',
          }}
        >
          <QueryManager
            queries={queries}
            onQueriesChange={setQueries}
            timeFrameOverrides={timeFrameOverrides}
            onTimeFrameOverridesChange={setTimeFrameOverrides}
            formulas={[formula, colorFormula]}
            accounts={simpleAccounts}
            onInsertProvider={insertIntoFormula}
          />
        </View>
      </View>
    </Page>
  );
}
