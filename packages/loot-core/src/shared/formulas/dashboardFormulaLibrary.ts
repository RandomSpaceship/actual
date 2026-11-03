import { isEqual } from 'es-toolkit';

import * as monthUtils from '#shared/months';
import type {
  ExportImportFormulaLibraryItem,
  FormulaLibraryItemEntity,
  FormulaLibraryQueryData,
  FormulaLibraryQueryEntity,
  FormulaWidget,
  TimeFrame,
} from '#types/models';

import { findQueryNameReferences, isSameQueryName } from './queryNameUses';

type FormulaMeta = NonNullable<FormulaWidget['meta']>;

function isFormulaMeta(type: string, meta: unknown): meta is FormulaMeta {
  return type === 'formula-card' && meta != null && typeof meta === 'object';
}

function findLocalQueryName(meta: FormulaMeta, name: string) {
  return Object.keys(meta.queries ?? {}).find(localName =>
    isSameQueryName(localName, name),
  );
}

// The library query names that a card uses. A name that a card query hides
// is not in the list.
function findLibraryQueryNames(meta: FormulaMeta) {
  return [meta.formula, meta.colorFormula]
    .flatMap(formula => (formula ? findQueryNameReferences(formula) : []))
    .map(({ name }) => name)
    .filter(name => findLocalQueryName(meta, name) === undefined);
}

// The library must be oldest first, because the oldest item wins a
// duplicate name
function findLibraryQuery<
  Item extends Pick<FormulaLibraryItemEntity, 'type' | 'name'>,
>(library: Item[], name: string) {
  return library.find(
    item => item.type === 'query' && isSameQueryName(item.name, name),
  );
}

function sortQueriesOldestFirst(library: FormulaLibraryItemEntity[]) {
  return library
    .filter((item): item is FormulaLibraryQueryEntity => item.type === 'query')
    .sort((a, b) => a.created_at - b.created_at);
}

// The library queries that the formula cards use, for a dashboard export
export function collectFormulaLibraryForExport(
  widgets: { type: string; meta: unknown }[],
  library: FormulaLibraryItemEntity[],
): ExportImportFormulaLibraryItem[] {
  const oldestFirst = sortQueriesOldestFirst(library);
  const items = new Map<string, ExportImportFormulaLibraryItem>();

  for (const { type, meta } of widgets) {
    if (!isFormulaMeta(type, meta)) continue;

    for (const name of findLibraryQueryNames(meta)) {
      const item = findLibraryQuery(oldestFirst, name);
      if (item && !items.has(item.id)) {
        items.set(item.id, {
          id: item.id,
          type: item.type,
          name: item.name,
          data: item.data,
        });
      }
    }
  }

  return [...items.values()];
}

function isSameQueryData(
  a: FormulaLibraryQueryData,
  b: FormulaLibraryQueryData,
) {
  return (
    isEqual(a.conditions ?? [], b.conditions ?? []) &&
    (a.conditionsOp ?? 'and') === (b.conditionsOp ?? 'and') &&
    isEqual(a.timeFrame, b.timeFrame)
  );
}

// A library time frame can leave out fields. A card query time frame cannot.
function completeTimeFrame(timeFrame: Partial<TimeFrame> | undefined) {
  return {
    start: monthUtils.firstDayOfMonth(monthUtils.currentDay()),
    end: monthUtils.currentDay(),
    mode: 'sliding-window',
    ...timeFrame,
  } satisfies TimeFrame;
}

export type FormulaLibraryImportPlan<Widget> = {
  widgets: Widget[];
  itemsToCreate: ExportImportFormulaLibraryItem[];
};

// For each exported library query:
// - The library has an identical query with the same name: the cards use it.
// - The library has a different query with the same name: each card that
//   uses the name gets a copy of the exported query as a card query. A card
//   query wins over a library query, so the card result does not change.
// - The library has no query with the name: it gets a new item.
// The card time frames for library queries move to the new ids. A card time
// frame for a query that becomes a card query goes into that card query.
export function planFormulaLibraryImport<
  Widget extends { type: string; meta?: unknown },
>(
  widgets: Widget[],
  exportedItems: ExportImportFormulaLibraryItem[],
  library: FormulaLibraryItemEntity[],
  createId: () => string,
): FormulaLibraryImportPlan<Widget> {
  const oldestFirst: ExportImportFormulaLibraryItem[] =
    sortQueriesOldestFirst(library);
  const itemsToCreate: ExportImportFormulaLibraryItem[] = [];
  const newIds = new Map<string, string>();
  const cardQueryItems = new Map<string, ExportImportFormulaLibraryItem>();

  for (const exportedItem of exportedItems) {
    const existingItem = findLibraryQuery(oldestFirst, exportedItem.name);
    if (!existingItem) {
      const newItem = { ...exportedItem, id: createId() };
      itemsToCreate.push(newItem);
      oldestFirst.push(newItem);
      newIds.set(exportedItem.id, newItem.id);
    } else if (isSameQueryData(existingItem.data, exportedItem.data)) {
      newIds.set(exportedItem.id, existingItem.id);
    } else {
      cardQueryItems.set(exportedItem.id, exportedItem);
    }
  }

  const newWidgets = widgets.map(widget => {
    const { type, meta } = widget;
    if (!isFormulaMeta(type, meta)) return widget;

    const usedNames = findLibraryQueryNames(meta);
    const queries = { ...meta.queries };
    for (const [exportedId, item] of cardQueryItems) {
      if (!usedNames.some(name => isSameQueryName(name, item.name))) continue;

      const { conditions = [], conditionsOp = 'and', timeFrame } = item.data;
      queries[item.name] = {
        conditions,
        conditionsOp,
        timeFrame:
          meta.timeFrameOverrides?.[exportedId]?.timeFrame ??
          completeTimeFrame(timeFrame),
      };
    }

    // An override for an id that is not in the export cannot be matched,
    // so it does not stay
    const timeFrameOverrides = Object.fromEntries(
      Object.entries(meta.timeFrameOverrides ?? {}).flatMap(
        ([exportedId, override]) => {
          const newId = newIds.get(exportedId);
          return newId ? [[newId, override]] : [];
        },
      ),
    );

    return {
      ...widget,
      meta: {
        ...meta,
        ...(meta.queries || Object.keys(queries).length > 0 ? { queries } : {}),
        ...(meta.timeFrameOverrides ? { timeFrameOverrides } : {}),
      },
    };
  });

  return { widgets: newWidgets, itemsToCreate };
}
