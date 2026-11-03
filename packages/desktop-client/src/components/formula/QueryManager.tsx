import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogTrigger } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgCopy, SvgTrash } from '@actual-app/components/icons/v1';
import { SvgDownloadThickBottom } from '@actual-app/components/icons/v2';
import { Input } from '@actual-app/components/input';
import { Popover } from '@actual-app/components/popover';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Toggle } from '@actual-app/components/toggle';
import { spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';
import { isSameQueryName } from '@actual-app/core/shared/formulas/queryNameUses';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  FormulaLibraryQueryEntity,
  FormulaTimeFrameOverride,
  RuleConditionEntity,
  TimeFrame,
} from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { AppliedFilters } from '#components/filters/AppliedFilters';
import { FilterButton } from '#components/filters/FiltersMenu';
import {
  formulaLibraryQueries,
  useCreateFormulaLibraryItemMutation,
} from '#formula-library';
import { useRuleConditionFilters } from '#hooks/useRuleConditionFilters';
import { pushModal } from '#modals/modalsSlice';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';
import type { AppDispatch } from '#redux/store';

import { LibraryQueryItem } from './LibraryQueryItem';
import {
  newQueryTimeFrame,
  normalizeQueryTimeFrameEnd,
  normalizeQueryTimeFrameStart,
} from './queryTimeFrame';
import { QueryTimeFrameControl } from './QueryTimeFrameControl';

type QueryConfig = {
  conditions?: RuleConditionEntity[];
  conditionsOp?: 'and' | 'or';
  timeFrame?: TimeFrame;
};

type QueryManagerProps = {
  queries: Record<string, QueryConfig>;
  onQueriesChange: (queries: Record<string, QueryConfig>) => void;
  // Keyed by library item id
  timeFrameOverrides: Record<string, FormulaTimeFrameOverride>;
  onTimeFrameOverridesChange: (
    timeFrameOverrides: Record<string, FormulaTimeFrameOverride>,
  ) => void;
};

export function QueryManager({
  queries,
  onQueriesChange,
  timeFrameOverrides,
  onTimeFrameOverridesChange,
}: QueryManagerProps) {
  const { t } = useTranslation();
  const [newQueryName, setNewQueryName] = useState('');
  const [isAddingQuery, setIsAddingQuery] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const dispatch = useDispatch();
  const { data: library = [] } = useQuery(formulaLibraryQueries.list());
  const createLibraryItem = useCreateFormulaLibraryItemMutation();

  const libraryQueries = library
    .filter(item => item.type === 'query')
    .sort((a, b) => a.name.localeCompare(b.name));

  function findLibraryQuery(name: string) {
    return libraryQueries.find(item => isSameQueryName(item.name, name));
  }

  function findCardQueryName(name: string) {
    return Object.keys(queries).find(queryName =>
      isSameQueryName(queryName, name),
    );
  }

  function handleAddQuery() {
    if (!newQueryName.trim()) return;

    if (queries[newQueryName]) {
      dispatch(
        addNotification({
          notification: {
            type: 'error',
            message: t('Query with this name already exists'),
          },
        }),
      );
      return;
    }

    onQueriesChange({
      ...queries,
      [newQueryName]: {
        conditions: [],
        conditionsOp: 'and',
        timeFrame: newQueryTimeFrame(),
      },
    });

    setNewQueryName('');
    setIsAddingQuery(false);
  }

  function handleRemoveQuery(queryName: string) {
    const newQueries = { ...queries };
    delete newQueries[queryName];
    onQueriesChange(newQueries);
  }

  function findTimeFrameOverride(item: FormulaLibraryQueryEntity) {
    return Object.hasOwn(timeFrameOverrides, item.id)
      ? timeFrameOverrides[item.id].timeFrame
      : undefined;
  }

  function handleCopyIntoCard(item: FormulaLibraryQueryEntity) {
    const { conditions = [], conditionsOp = 'and', timeFrame } = item.data;
    onQueriesChange({
      ...queries,
      [item.name]: {
        conditions,
        conditionsOp,
        // The copy keeps the time frame that the card uses now
        timeFrame: findTimeFrameOverride(item) ?? {
          ...newQueryTimeFrame(),
          ...timeFrame,
        },
      },
    });
  }

  // A null time frame removes the override
  function handleTimeFrameOverrideChange(
    item: FormulaLibraryQueryEntity,
    timeFrame: TimeFrame | null,
  ) {
    const newOverrides = { ...timeFrameOverrides };
    if (timeFrame) {
      newOverrides[item.id] = { name: item.name, timeFrame };
    } else {
      delete newOverrides[item.id];
    }
    onTimeFrameOverridesChange(newOverrides);
  }

  async function handleMakeShared(queryName: string) {
    const { conditions, conditionsOp, timeFrame } = queries[queryName];
    await createLibraryItem.mutateAsync({
      type: 'query',
      name: queryName,
      data: { conditions, conditionsOp, timeFrame },
    });
    handleRemoveQuery(queryName);
    setShowLibrary(true);
    dispatch(
      addNotification({
        notification: {
          type: 'message',
          message: t(
            '"{{name}}" is now a library query. Save the widget to remove the card copy.',
            { name: queryName },
          ),
        },
      }),
    );
  }

  function handleEditLibraryQuery(item: FormulaLibraryQueryEntity) {
    dispatch(
      pushModal({
        modal: { name: 'edit-formula-library-query', options: { item } },
      }),
    );
  }

  function handleUpdateQuery(queryName: string, config: QueryConfig) {
    onQueriesChange({
      ...queries,
      [queryName]: config,
    });
  }

  return (
    <View style={{ padding: 20, flex: 1, minWidth: 400 }}>
      <View
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: 600 }}>
          <Trans>Query Definitions</Trans>
        </Text>
        <Button
          variant="primary"
          onPress={() => setIsAddingQuery(!isAddingQuery)}
        >
          {isAddingQuery ? <Trans>Cancel</Trans> : <Trans>Add Query</Trans>}
        </Button>
      </View>

      {isAddingQuery && (
        <View
          style={{
            padding: 16,
            border: `1px solid ${theme.tableBorder}`,
            borderRadius: 4,
            marginBottom: 16,
            backgroundColor: theme.tableBackground,
          }}
        >
          <View style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
            <Input
              placeholder={t("Query name (e.g., 'expenses', 'income')")}
              value={newQueryName}
              onChange={e => setNewQueryName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleAddQuery();
                }
              }}
              style={{ flex: 1 }}
            />
            <Button variant="primary" onPress={handleAddQuery}>
              <Trans>Create</Trans>
            </Button>
          </View>
        </View>
      )}

      {Object.entries(queries).length === 0 ? (
        <View
          style={{
            padding: 32,
            textAlign: 'center',
            color: theme.pageTextSubdued,
            border: `1px dashed ${theme.tableBorder}`,
            borderRadius: 4,
            maxWidth: 400,
          }}
        >
          <Text>
            <Trans>
              No queries defined. Click 'Add Query' to create your first query.
            </Trans>
          </Text>
          <Text size="small" style={{ marginTop: spacing.sm }}>
            <Trans>
              Queries allow you to reference filtered transaction data in your
              formulas using QUERY("queryName") or QUERY_COUNT("queryName")
            </Trans>
          </Text>
        </View>
      ) : (
        <View style={{ display: 'block' }}>
          {Object.entries(queries).map(([queryName, config]) => (
            <QueryItem
              key={queryName}
              queryName={queryName}
              defaultConfig={config}
              onUpdate={newConfig => handleUpdateQuery(queryName, newConfig)}
              onRemove={() => handleRemoveQuery(queryName)}
              onMakeShared={
                findLibraryQuery(queryName)
                  ? undefined
                  : () => void handleMakeShared(queryName)
              }
              warning={
                findLibraryQuery(queryName)
                  ? t('Hides the library query with the same name')
                  : undefined
              }
            />
          ))}
        </View>
      )}

      {libraryQueries.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <Toggle
              id="query-manager-show-library"
              isOn={showLibrary}
              onToggle={setShowLibrary}
            />
            <label htmlFor="query-manager-show-library">
              <Trans count={libraryQueries.length}>
                Show library queries ({{ count: libraryQueries.length }})
              </Trans>
            </label>
          </View>
          {showLibrary &&
            libraryQueries.map(item => (
              <LibraryQueryItem
                key={item.id}
                item={item}
                isHidden={findCardQueryName(item.name) !== undefined}
                onEdit={() => handleEditLibraryQuery(item)}
                onCopyIntoCard={
                  findCardQueryName(item.name) === undefined
                    ? () => handleCopyIntoCard(item)
                    : undefined
                }
                timeFrameOverride={findTimeFrameOverride(item)}
                onTimeFrameOverrideChange={
                  findCardQueryName(item.name) === undefined
                    ? timeFrame =>
                        handleTimeFrameOverrideChange(item, timeFrame)
                    : undefined
                }
              />
            ))}
        </View>
      )}
    </View>
  );
}

type QueryItemProps = {
  queryName: string;
  // A missing part of the time frame gets a default
  defaultConfig: Omit<QueryConfig, 'timeFrame'> & {
    timeFrame?: Partial<TimeFrame>;
  };
  onUpdate: (config: QueryConfig) => void;
  // Without it, there is no remove button
  onRemove?: () => void;
  // Without it, there is no "Make shared" button
  onMakeShared?: () => void;
  // A short line under the name
  warning?: string;
};

export function QueryItem({
  queryName,
  defaultConfig,
  onUpdate,
  onRemove,
  onMakeShared,
  warning,
}: QueryItemProps) {
  const { t } = useTranslation();
  const [importJsonText, setImportJsonText] = useState('');
  const dispatch = useDispatch<AppDispatch>();

  const [timeFrame, setTimeFrame] = useState<TimeFrame>({
    start:
      defaultConfig.timeFrame?.start ||
      monthUtils.dayFromDate(monthUtils.currentMonth()),
    end: defaultConfig.timeFrame?.end || monthUtils.currentDay(),
    mode: defaultConfig.timeFrame?.mode || 'sliding-window',
  });

  const conditionsRef = useRef<RuleConditionEntity[]>(
    defaultConfig.conditions || [],
  );

  // Accepting null here to detect changes and make rerender work properly:
  const conditionsOpRef = useRef<'and' | 'or' | null>(
    defaultConfig.conditionsOp || null,
  );

  useEffect(() => {
    if (conditionsRef.current.length === 0) {
      conditionsRef.current = defaultConfig.conditions || [];
    }

    if (conditionsOpRef.current === null) {
      conditionsOpRef.current = defaultConfig.conditionsOp || 'and';
    }
  }, [defaultConfig]);

  const filters = useRuleConditionFilters(
    conditionsRef.current,
    conditionsOpRef.current ?? ('and' as 'and' | 'or'),
  );

  const prevFiltersRef = useRef<{
    conditions: RuleConditionEntity[];
    conditionsOp: 'and' | 'or';
  }>({
    conditions: filters.conditions,
    conditionsOp: filters.conditionsOp,
  });

  const sendUpdate = useCallback(
    (
      conditions = filters.conditions,
      conditionsOp = filters.conditionsOp,
      newTimeFrame = timeFrame,
    ) => {
      setTimeFrame(newTimeFrame);
      onUpdate({ conditions, conditionsOp, timeFrame: newTimeFrame });
    },
    [filters.conditions, filters.conditionsOp, timeFrame, onUpdate],
  );

  useEffect(() => {
    const prev = prevFiltersRef.current;
    const conditionsChanged =
      JSON.stringify(prev.conditions) !== JSON.stringify(filters.conditions);
    const conditionsOpChanged = prev.conditionsOp !== filters.conditionsOp;

    if (conditionsChanged || conditionsOpChanged) {
      prevFiltersRef.current = {
        conditions: filters.conditions,
        conditionsOp: filters.conditionsOp,
      };
      sendUpdate();
    }
  }, [filters.conditions, filters.conditionsOp, sendUpdate]);

  async function handleExport() {
    const config = {
      conditions: filters.conditions,
      conditionsOp: filters.conditionsOp,
      timeFrame,
    };

    const jsonString = JSON.stringify(config, null, 2);

    try {
      await navigator.clipboard.writeText(jsonString);
      dispatch(
        addNotification({
          notification: {
            type: 'message',
            message: t('Query configuration copied to clipboard'),
          },
        }),
      );
    } catch {
      dispatch(
        addNotification({
          notification: {
            type: 'error',
            message: t('Failed to copy to clipboard'),
          },
        }),
      );
    }
  }

  function handleImport() {
    try {
      const config = JSON.parse(importJsonText);
      if (config.conditions && config.conditionsOp && config.timeFrame) {
        // Update refs
        conditionsRef.current = config.conditions;
        conditionsOpRef.current = config.conditionsOp;
        // The filter hook reads the refs only on mount, so give it the new
        // conditions too. Without this, the filters UI keeps the old ones.
        filters.onApply({
          conditions: config.conditions,
          conditionsOp: config.conditionsOp,
          id: null,
        });

        // Update the query
        sendUpdate(config.conditions, config.conditionsOp, {
          start: config.timeFrame.start
            ? normalizeQueryTimeFrameStart(config.timeFrame.start)
            : monthUtils.dayFromDate(monthUtils.currentMonth()),
          end: config.timeFrame.end
            ? normalizeQueryTimeFrameEnd(config.timeFrame.end)
            : monthUtils.currentDay(),
          mode: config.timeFrame.mode,
        });
        setImportJsonText('');
      } else {
        dispatch(
          addNotification({
            notification: {
              type: 'error',
              message: t('Invalid JSON. Please check your input.'),
            },
          }),
        );
      }
    } catch {
      dispatch(
        addNotification({
          notification: {
            type: 'error',
            message: t('Invalid JSON. Please check your input.'),
          },
        }),
      );
    }
  }

  return (
    <View
      style={{
        padding: 16,
        marginBottom: 16,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 4,
        backgroundColor: theme.tableBackground,
        display: 'block',
        flex: 1,
      }}
    >
      <View
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <View
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontWeight: 600, fontFamily: 'monospace' }}>
            <Trans>QUERY("{queryName}")</Trans>
          </Text>
        </View>
        <View
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 8,
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <View style={{ display: 'flex', flexDirection: 'row', gap: 4 }}>
            {onMakeShared && (
              <Button variant="bare" onPress={onMakeShared}>
                <Trans>Make shared</Trans>
              </Button>
            )}
            <Button
              variant="bare"
              onPress={handleExport}
              aria-label={t('Export query configuration')}
            >
              <SvgCopy style={{ width: 13, height: 13 }} />
            </Button>
            <DialogTrigger>
              <Button
                variant="bare"
                aria-label={t('Import query configuration')}
              >
                <SvgDownloadThickBottom style={{ width: 13, height: 13 }} />
              </Button>
              <Popover>
                <Dialog>
                  <View style={{ padding: 16, minWidth: 400 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 12,
                      }}
                    >
                      <Trans>Import Query Configuration</Trans>
                    </Text>
                    <Text
                      size="small"
                      style={{
                        color: theme.pageTextSubdued,
                        marginBottom: spacing.sm,
                      }}
                    >
                      <Trans>Paste the JSON configuration below:</Trans>
                    </Text>
                    <textarea
                      value={importJsonText}
                      onChange={e => setImportJsonText(e.target.value)}
                      placeholder={JSON.stringify(
                        {
                          conditions: [],
                          conditionsOp: 'and',
                          timeFrame: {
                            start: '',
                            end: '',
                            mode: 'sliding-window',
                          },
                        },
                        null,
                        2,
                      )}
                      style={{
                        width: '100%',
                        height: 200,
                        padding: 8,
                        border: `1px solid ${theme.formInputBorder}`,
                        borderRadius: 4,
                        backgroundColor: theme.tableBackground,
                        color: theme.formInputText,
                        fontFamily: 'monospace',
                        fontSize: 12,
                        resize: 'vertical',
                        outline: 'none',
                      }}
                    />
                    <View
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: 8,
                        marginTop: 12,
                        justifyContent: 'flex-end',
                      }}
                    >
                      <Button variant="bare" slot="close">
                        <Trans>Cancel</Trans>
                      </Button>
                      <Button
                        variant="primary"
                        onPress={handleImport}
                        slot="close"
                      >
                        <Trans>Import</Trans>
                      </Button>
                    </View>
                  </View>
                </Dialog>
              </Popover>
            </DialogTrigger>
            {onRemove && (
              <Button variant="bare" onPress={onRemove}>
                <SvgTrash style={{ width: 13, height: 13 }} />
              </Button>
            )}
          </View>
        </View>
      </View>
      {warning && (
        <Text style={{ color: theme.warningText, fontSize: 12 }}>
          {warning}
        </Text>
      )}

      <QueryTimeFrameControl
        timeFrame={timeFrame}
        onChange={newTimeFrame =>
          sendUpdate(filters.conditions, filters.conditionsOp, newTimeFrame)
        }
      />

      <View style={{ marginBottom: spacing.sm, flex: 1 }}>
        <Text
          size="small"
          style={{
            fontWeight: 500,
            marginBottom: 6,
            color: theme.pageTextSubdued,
          }}
        >
          <Trans>Filters:</Trans>
        </Text>
        <View
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            maxWidth: 400,
            flex: 1,
          }}
        >
          {filters.conditions.length > 0 && (
            <AppliedFilters
              conditions={filters.conditions}
              onUpdate={filters.onUpdate}
              onDelete={filters.onDelete}
              conditionsOp={filters.conditionsOp}
              onConditionsOpChange={filters.onConditionsOpChange}
              style={{ maxWidth: '100%' }}
            />
          )}
          <FilterButton
            compact={false}
            onApply={filters.onApply}
            hover={false}
          />
        </View>
      </View>
    </View>
  );
}
