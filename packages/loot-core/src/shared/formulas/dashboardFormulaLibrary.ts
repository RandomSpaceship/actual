import { isEqual } from 'es-toolkit';

import * as monthUtils from '#shared/months';
import type {
  ExportImportFormulaLibraryItem,
  ExportImportFormulaLibraryProvider,
  ExportImportFormulaLibraryQuery,
  FormulaLibraryItemEntity,
  FormulaLibraryQueryData,
  FormulaWidget,
  TimeFrame,
} from '#types/models';

import {
  findProviderNameReferences,
  isSameProviderName,
  isValidProviderName,
  renameProviderInFormula,
} from './providerNameUses';
import { findQueryNameReferences, isSameQueryName } from './queryNameUses';

type FormulaMeta = NonNullable<FormulaWidget['meta']>;

// Provider formulas, keyed by the provider name in upper case
type ProviderFormulas = Map<string, string>;

function isFormulaMeta(type: string, meta: unknown): meta is FormulaMeta {
  return type === 'formula-card' && meta != null && typeof meta === 'object';
}

function findLocalQueryName(meta: FormulaMeta, name: string) {
  return Object.keys(meta.queries ?? {}).find(localName =>
    isSameQueryName(localName, name),
  );
}

function getCardFormulas(meta: FormulaMeta) {
  return [meta.formula, meta.colorFormula].filter(
    (formula): formula is string => Boolean(formula),
  );
}

function isCardProviderName(meta: FormulaMeta, name: string) {
  return Object.keys(meta.providers ?? {}).some(cardName =>
    isSameProviderName(cardName, name),
  );
}

// The providers as the card sees them: a card provider wins over a library
// provider with the same name
function getCardProviderFormulas(
  meta: FormulaMeta,
  providers: ProviderFormulas,
): ProviderFormulas {
  const cardProviders: ProviderFormulas = new Map(providers);
  for (const [name, { formula }] of Object.entries(meta.providers ?? {})) {
    cardProviders.set(name.toUpperCase(), formula);
  }
  return cardProviders;
}

// The library provider names that a card uses, also through card providers
function findLibraryProviderNames(
  meta: FormulaMeta,
  providers: ProviderFormulas,
) {
  return findProviderNames(
    getCardFormulas(meta),
    getCardProviderFormulas(meta, providers),
  ).filter(name => !isCardProviderName(meta, name));
}

// The names of the providers that the formulas use, also through other
// providers. A name that is not in providers is not in the list.
function findProviderNames(formulas: string[], providers: ProviderFormulas) {
  const names = new Map<string, string>();

  function visit(formula: string) {
    for (const { name } of findProviderNameReferences(formula)) {
      const key = name.toUpperCase();
      const providerFormula = providers.get(key);
      if (providerFormula === undefined || names.has(key)) continue;
      names.set(key, name);
      visit(providerFormula);
    }
  }

  formulas.forEach(visit);
  return [...names.values()];
}

// The library query names that a card uses, also through card and library
// providers. A provider uses the queries of the card, so a name that a card
// query hides is not in the list.
function findLibraryQueryNames(meta: FormulaMeta, providers: ProviderFormulas) {
  const formulas = getCardFormulas(meta);
  const cardProviders = getCardProviderFormulas(meta, providers);
  const providerFormulas = findProviderNames(formulas, cardProviders).map(
    name => cardProviders.get(name.toUpperCase()) ?? '',
  );
  return [...formulas, ...providerFormulas]
    .flatMap(formula => findQueryNameReferences(formula))
    .map(({ name }) => name)
    .filter(name => findLocalQueryName(meta, name) === undefined);
}

// The library must be oldest first, because the oldest item wins a
// duplicate name
function findLibraryItem<
  Item extends Pick<FormulaLibraryItemEntity, 'type' | 'name'>,
>(library: Item[], type: Item['type'], name: string) {
  return library.find(
    item => item.type === type && isSameQueryName(item.name, name),
  );
}

type ExportableLibraryItem = Exclude<
  FormulaLibraryItemEntity,
  { type: 'aql-query' }
>;

// AQL queries are not in a dashboard export yet
function sortOldestFirst(library: FormulaLibraryItemEntity[]) {
  return library
    .filter((item): item is ExportableLibraryItem => item.type !== 'aql-query')
    .sort((a, b) => a.created_at - b.created_at);
}

// The winning provider of each name, as formulas use them
function getProviderFormulas(
  library: ExportImportFormulaLibraryItem[],
): ProviderFormulas {
  const providers: ProviderFormulas = new Map();
  for (const item of library) {
    const key = item.name.toUpperCase();
    if (item.type === 'provider' && !providers.has(key)) {
      providers.set(key, item.data.formula);
    }
  }
  return providers;
}

function toExportItem(
  item: ExportableLibraryItem,
): ExportImportFormulaLibraryItem {
  return item.type === 'provider'
    ? { id: item.id, type: item.type, name: item.name, data: item.data }
    : { id: item.id, type: item.type, name: item.name, data: item.data };
}

// The library queries and providers that the formula cards use, for a
// dashboard export
export function collectFormulaLibraryForExport(
  widgets: { type: string; meta: unknown }[],
  library: FormulaLibraryItemEntity[],
): ExportImportFormulaLibraryItem[] {
  const oldestFirst = sortOldestFirst(library);
  const providers = getProviderFormulas(oldestFirst);
  const items = new Map<string, ExportImportFormulaLibraryItem>();

  function add(item: ExportableLibraryItem | undefined) {
    if (item && !items.has(item.id)) {
      items.set(item.id, toExportItem(item));
    }
  }

  for (const { type, meta } of widgets) {
    if (!isFormulaMeta(type, meta)) continue;

    for (const name of findLibraryQueryNames(meta, providers)) {
      add(findLibraryItem(oldestFirst, 'query', name));
    }
    for (const name of findLibraryProviderNames(meta, providers)) {
      add(findLibraryItem(oldestFirst, 'provider', name));
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

function renameProviders(formula: string, renames: Map<string, string>) {
  let renamed = formula;
  for (const [oldName, newName] of renames) {
    renamed = renameProviderInFormula(renamed, oldName, newName);
  }
  return renamed;
}

// The first name of the form Name_2, Name_3 ... that no item in names has
function findFreeProviderName(name: string, names: string[]) {
  for (let suffix = 2; ; suffix++) {
    const candidate = `${name}_${suffix}`;
    if (
      isValidProviderName(candidate) &&
      !names.some(usedName => isSameProviderName(usedName, candidate))
    ) {
      return candidate;
    }
  }
}

type ProviderImportPlan = {
  itemsToCreate: ExportImportFormulaLibraryProvider[];
  // Exported provider names that the import changes, keyed by the old name
  renames: Map<string, string>;
};

// For each exported provider, after the renames of the providers that it
// uses:
// - The library has a provider with the same name and formula: use it.
// - The library has a provider with the same name and a different formula:
//   import it with a new name, and rename it in the imported formulas.
// - The library has no provider with the name: it gets a new item.
function planProviderImport(
  exportedProviders: ExportImportFormulaLibraryProvider[],
  library: ExportableLibraryItem[],
  createId: () => string,
): ProviderImportPlan {
  const localProviders = getProviderFormulas(library.map(toExportItem));
  const exportedFormulas = getProviderFormulas(exportedProviders);
  const usedNames = [
    ...library.filter(item => item.type === 'provider').map(item => item.name),
    ...exportedProviders.map(item => item.name),
  ];
  const itemsToCreate: ExportImportFormulaLibraryProvider[] = [];
  const renames = new Map<string, string>();
  const planned = new Set<string>();

  // The providers that a provider uses come first, so that their renames are
  // known. A cycle stops the walk.
  function plan(provider: ExportImportFormulaLibraryProvider) {
    const key = provider.name.toUpperCase();
    if (planned.has(key)) return;
    planned.add(key);

    for (const name of findProviderNames(
      [provider.data.formula],
      exportedFormulas,
    )) {
      const usedProvider = exportedProviders.find(item =>
        isSameProviderName(item.name, name),
      );
      if (usedProvider) plan(usedProvider);
    }

    const formula = renameProviders(provider.data.formula, renames);
    const localFormula = localProviders.get(key);
    if (localFormula === formula) return;

    const name =
      localFormula === undefined
        ? provider.name
        : findFreeProviderName(provider.name, usedNames);
    if (name !== provider.name) {
      renames.set(provider.name, name);
      usedNames.push(name);
    }
    itemsToCreate.push({
      ...provider,
      id: createId(),
      name,
      data: { ...provider.data, formula },
    });
  }

  exportedProviders.forEach(plan);

  // In a cycle, a provider can use a provider that got its new name later
  return {
    itemsToCreate: itemsToCreate.map(item => ({
      ...item,
      data: {
        ...item.data,
        formula: renameProviders(item.data.formula, renames),
      },
    })),
    renames,
  };
}

export type FormulaLibraryImportPlan<Widget> = {
  widgets: Widget[];
  itemsToCreate: ExportImportFormulaLibraryItem[];
};

// Providers: see planProviderImport.
//
// For each exported library query:
// - The library has an identical query with the same name: the cards use it.
// - The library has a different query with the same name: each card that
//   uses the name, also through a provider, gets a copy of the exported query
//   as a card query. A card query wins over a library query, so the card
//   result does not change.
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
  const oldestFirst = sortOldestFirst(library);
  const exportedProviders = exportedItems.filter(
    (item): item is ExportImportFormulaLibraryProvider =>
      item.type === 'provider',
  );
  const exportedProviderFormulas = getProviderFormulas(exportedProviders);
  const providerPlan = planProviderImport(
    exportedProviders,
    oldestFirst,
    createId,
  );

  const libraryQueries = oldestFirst
    .map(toExportItem)
    .filter(
      (item): item is ExportImportFormulaLibraryQuery => item.type === 'query',
    );
  const queriesToCreate: ExportImportFormulaLibraryQuery[] = [];
  const newIds = new Map<string, string>();
  const cardQueryItems = new Map<string, ExportImportFormulaLibraryQuery>();

  for (const exportedItem of exportedItems) {
    if (exportedItem.type !== 'query') continue;

    const existingItem = findLibraryItem(
      libraryQueries,
      'query',
      exportedItem.name,
    );
    if (!existingItem) {
      const newItem = { ...exportedItem, id: createId() };
      queriesToCreate.push(newItem);
      libraryQueries.push(newItem);
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

    const usedNames = findLibraryQueryNames(meta, exportedProviderFormulas);
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

    // A name that a card provider hides is not the library provider
    const cardRenames = new Map(
      [...providerPlan.renames].filter(
        ([oldName]) => !isCardProviderName(meta, oldName),
      ),
    );
    const rename = (formula: string | undefined) =>
      formula === undefined ? undefined : renameProviders(formula, cardRenames);

    return {
      ...widget,
      meta: {
        ...meta,
        ...(cardRenames.size > 0 && {
          formula: rename(meta.formula),
          colorFormula: rename(meta.colorFormula),
          ...(meta.providers && {
            providers: Object.fromEntries(
              Object.entries(meta.providers).map(([name, provider]) => [
                name,
                {
                  ...provider,
                  formula: renameProviders(provider.formula, cardRenames),
                },
              ]),
            ),
          }),
        }),
        ...(meta.queries || Object.keys(queries).length > 0 ? { queries } : {}),
        ...(meta.timeFrameOverrides ? { timeFrameOverrides } : {}),
      },
    };
  });

  return {
    widgets: newWidgets,
    itemsToCreate: [...queriesToCreate, ...providerPlan.itemsToCreate],
  };
}
