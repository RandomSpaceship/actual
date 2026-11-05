import { isEqual } from 'es-toolkit';

import * as monthUtils from '#shared/months';
import type {
  ExportImportFormulaLibraryAqlQuery,
  ExportImportFormulaLibraryItem,
  ExportImportFormulaLibraryNamedFormula,
  ExportImportFormulaLibraryQuery,
  FormulaLibraryAqlQueryData,
  FormulaLibraryItemEntity,
  FormulaLibraryQueryData,
  FormulaWidget,
  TimeFrame,
} from '#types/models';

import {
  findNamedFormulaNameReferences,
  isSameNamedFormulaName,
  isValidNamedFormulaName,
  renameNamedFormulaInFormula,
} from './namedFormulaNameUses';
import {
  findQueryNameReferences,
  isSameQueryName,
  renameQueryInFormula,
} from './queryNameUses';

type FormulaMeta = NonNullable<FormulaWidget['meta']>;

// Named formula formulas, keyed by the named formula name in upper case
type NamedFormulaFormulas = Map<string, string>;

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

function isCardNamedFormulaName(meta: FormulaMeta, name: string) {
  return Object.keys(meta.namedFormulas ?? {}).some(cardName =>
    isSameNamedFormulaName(cardName, name),
  );
}

// The named formulas as the card sees them: a card named formula wins over a library
// named formula with the same name
function getCardNamedFormulaFormulas(
  meta: FormulaMeta,
  namedFormulas: NamedFormulaFormulas,
): NamedFormulaFormulas {
  const cardNamedFormulas: NamedFormulaFormulas = new Map(namedFormulas);
  for (const [name, { formula }] of Object.entries(meta.namedFormulas ?? {})) {
    cardNamedFormulas.set(name.toUpperCase(), formula);
  }
  return cardNamedFormulas;
}

// The library named formula names that a card uses, also through card named formulas
function findLibraryNamedFormulaNames(
  meta: FormulaMeta,
  namedFormulas: NamedFormulaFormulas,
) {
  return findNamedFormulaNames(
    getCardFormulas(meta),
    getCardNamedFormulaFormulas(meta, namedFormulas),
  ).filter(name => !isCardNamedFormulaName(meta, name));
}

// The names of the named formulas that the formulas use, also through other
// named formulas. A name that is not in named formulas is not in the list.
function findNamedFormulaNames(
  formulas: string[],
  namedFormulas: NamedFormulaFormulas,
) {
  const names = new Map<string, string>();

  function visit(formula: string) {
    for (const { name } of findNamedFormulaNameReferences(formula)) {
      const key = name.toUpperCase();
      const namedFormulaFormula = namedFormulas.get(key);
      if (namedFormulaFormula === undefined || names.has(key)) continue;
      names.set(key, name);
      visit(namedFormulaFormula);
    }
  }

  formulas.forEach(visit);
  return [...names.values()];
}

// The library query names that a card uses, also through card and library
// named formulas. A named formula uses the queries of the card, so a name that a card
// query hides is not in the list.
function findLibraryQueryNames(
  meta: FormulaMeta,
  namedFormulas: NamedFormulaFormulas,
) {
  const formulas = getCardFormulas(meta);
  const cardNamedFormulas = getCardNamedFormulaFormulas(meta, namedFormulas);
  const namedFormulaFormulas = findNamedFormulaNames(
    formulas,
    cardNamedFormulas,
  ).map(name => cardNamedFormulas.get(name.toUpperCase()) ?? '');
  return [...formulas, ...namedFormulaFormulas]
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

function sortOldestFirst(library: FormulaLibraryItemEntity[]) {
  return [...library].sort((a, b) => a.created_at - b.created_at);
}

// Filter queries and AQL queries share one set of names
type ExportImportNamedQuery =
  | ExportImportFormulaLibraryQuery
  | ExportImportFormulaLibraryAqlQuery;

function isNamedQuery(item: Pick<FormulaLibraryItemEntity, 'type'>): boolean {
  return item.type === 'query' || item.type === 'aql-query';
}

function isExportImportNamedQuery(
  item: ExportImportFormulaLibraryItem,
): item is ExportImportNamedQuery {
  return isNamedQuery(item);
}

// The library must be oldest first, because the oldest item wins a
// duplicate name
function findLibraryNamedQuery<
  Item extends Pick<FormulaLibraryItemEntity, 'type' | 'name'>,
>(library: Item[], name: string) {
  return library.find(
    item => isNamedQuery(item) && isSameQueryName(item.name, name),
  );
}

// The winning named formula of each name, as formulas use them
function getNamedFormulaFormulas(
  library: ExportImportFormulaLibraryItem[],
): NamedFormulaFormulas {
  const namedFormulas: NamedFormulaFormulas = new Map();
  for (const item of library) {
    const key = item.name.toUpperCase();
    if (item.type === 'named-formula' && !namedFormulas.has(key)) {
      namedFormulas.set(key, item.data.formula);
    }
  }
  return namedFormulas;
}

function toExportItem(
  item: FormulaLibraryItemEntity,
): ExportImportFormulaLibraryItem {
  switch (item.type) {
    case 'named-formula':
      return { id: item.id, type: item.type, name: item.name, data: item.data };
    case 'aql-query':
      return { id: item.id, type: item.type, name: item.name, data: item.data };
    default:
      return { id: item.id, type: item.type, name: item.name, data: item.data };
  }
}

// The library queries and named formulas that the formula cards use, for a
// dashboard export
export function collectFormulaLibraryForExport(
  widgets: { type: string; meta: unknown }[],
  library: FormulaLibraryItemEntity[],
): ExportImportFormulaLibraryItem[] {
  const oldestFirst = sortOldestFirst(library);
  const namedFormulas = getNamedFormulaFormulas(oldestFirst);
  const items = new Map<string, ExportImportFormulaLibraryItem>();

  function add(item: FormulaLibraryItemEntity | undefined) {
    if (item && !items.has(item.id)) {
      items.set(item.id, toExportItem(item));
    }
  }

  for (const { type, meta } of widgets) {
    if (!isFormulaMeta(type, meta)) continue;

    for (const name of findLibraryQueryNames(meta, namedFormulas)) {
      add(findLibraryNamedQuery(oldestFirst, name));
    }
    for (const name of findLibraryNamedFormulaNames(meta, namedFormulas)) {
      add(findLibraryItem(oldestFirst, 'named-formula', name));
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

// The same query, as JSON. A change in the layout of the text does not count.
function isSameAqlQueryData(
  a: FormulaLibraryAqlQueryData,
  b: FormulaLibraryAqlQueryData,
) {
  return (
    isSameAqlText(a.aql, b.aql) &&
    // null (no date field) is not the same as undefined (the table default)
    a.dateField === b.dateField &&
    Boolean(a.isCount) === Boolean(b.isCount) &&
    isEqual(a.timeFrame, b.timeFrame) &&
    isEqual(
      a.moneyColumns === undefined ? undefined : [...a.moneyColumns].sort(),
      b.moneyColumns === undefined ? undefined : [...b.moneyColumns].sort(),
    ) &&
    a.rowLimit === b.rowLimit
  );
}

function isSameAqlText(a: string, b: string) {
  try {
    return isEqual(JSON.parse(a), JSON.parse(b));
  } catch {
    return a === b;
  }
}

function isSameNamedQuery(
  a: ExportImportNamedQuery,
  b: ExportImportNamedQuery,
) {
  if (a.type === 'query' && b.type === 'query') {
    return isSameQueryData(a.data, b.data);
  }
  if (a.type === 'aql-query' && b.type === 'aql-query') {
    return isSameAqlQueryData(a.data, b.data);
  }
  return false;
}

// The first name of the form name_2, name_3 ... that no item in names has
function findFreeQueryName(name: string, names: string[]) {
  for (let suffix = 2; ; suffix++) {
    const candidate = `${name}_${suffix}`;
    if (!names.some(usedName => isSameQueryName(usedName, candidate))) {
      return candidate;
    }
  }
}

function renameQueries(formula: string, renames: Map<string, string>) {
  let renamed = formula;
  for (const [oldName, newName] of renames) {
    renamed = renameQueryInFormula(renamed, oldName, newName);
  }
  return renamed;
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

function renameNamedFormulas(formula: string, renames: Map<string, string>) {
  let renamed = formula;
  for (const [oldName, newName] of renames) {
    renamed = renameNamedFormulaInFormula(renamed, oldName, newName);
  }
  return renamed;
}

// The first name of the form Name_2, Name_3 ... that no item in names has
function findFreeNamedFormulaName(name: string, names: string[]) {
  for (let suffix = 2; ; suffix++) {
    const candidate = `${name}_${suffix}`;
    if (
      isValidNamedFormulaName(candidate) &&
      !names.some(usedName => isSameNamedFormulaName(usedName, candidate))
    ) {
      return candidate;
    }
  }
}

type NamedFormulaImportPlan = {
  itemsToCreate: ExportImportFormulaLibraryNamedFormula[];
  // Exported named formula names that the import changes, keyed by the old name
  renames: Map<string, string>;
};

// For each exported named formula, after the renames of the named formulas that it
// uses:
// - The library has a named formula with the same name and formula: use it.
// - The library has a named formula with the same name and a different formula:
//   import it with a new name, and rename it in the imported formulas.
// - The library has no named formula with the name: it gets a new item.
function planNamedFormulaImport(
  exportedNamedFormulas: ExportImportFormulaLibraryNamedFormula[],
  library: FormulaLibraryItemEntity[],
  createId: () => string,
): NamedFormulaImportPlan {
  const localNamedFormulas = getNamedFormulaFormulas(library.map(toExportItem));
  const exportedFormulas = getNamedFormulaFormulas(exportedNamedFormulas);
  const usedNames = [
    ...library
      .filter(item => item.type === 'named-formula')
      .map(item => item.name),
    ...exportedNamedFormulas.map(item => item.name),
  ];
  const itemsToCreate: ExportImportFormulaLibraryNamedFormula[] = [];
  const renames = new Map<string, string>();
  const planned = new Set<string>();

  // The named formulas that a named formula uses come first, so that their renames are
  // known. A cycle stops the walk.
  function plan(namedFormula: ExportImportFormulaLibraryNamedFormula) {
    const key = namedFormula.name.toUpperCase();
    if (planned.has(key)) return;
    planned.add(key);

    for (const name of findNamedFormulaNames(
      [namedFormula.data.formula],
      exportedFormulas,
    )) {
      const usedNamedFormula = exportedNamedFormulas.find(item =>
        isSameNamedFormulaName(item.name, name),
      );
      if (usedNamedFormula) plan(usedNamedFormula);
    }

    const formula = renameNamedFormulas(namedFormula.data.formula, renames);
    const localFormula = localNamedFormulas.get(key);
    if (localFormula === formula) return;

    const name =
      localFormula === undefined
        ? namedFormula.name
        : findFreeNamedFormulaName(namedFormula.name, usedNames);
    if (name !== namedFormula.name) {
      renames.set(namedFormula.name, name);
      usedNames.push(name);
    }
    itemsToCreate.push({
      ...namedFormula,
      id: createId(),
      name,
      data: { ...namedFormula.data, formula },
    });
  }

  exportedNamedFormulas.forEach(plan);

  // In a cycle, a named formula can use a named formula that got its new name later
  return {
    itemsToCreate: itemsToCreate.map(item => ({
      ...item,
      data: {
        ...item.data,
        formula: renameNamedFormulas(item.data.formula, renames),
      },
    })),
    renames,
  };
}

export type FormulaLibraryImportPlan<Widget> = {
  widgets: Widget[];
  itemsToCreate: ExportImportFormulaLibraryItem[];
};

// Named formulas: see planNamedFormulaImport.
//
// For each exported library query:
// - The library has an identical query with the same name: the cards use it.
// - The library has a different query with the same name: each card that
//   uses the name, also through a named formula, gets a copy of the exported query
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
  const exportedNamedFormulas = exportedItems.filter(
    (item): item is ExportImportFormulaLibraryNamedFormula =>
      item.type === 'named-formula',
  );
  const exportedNamedFormulaFormulas = getNamedFormulaFormulas(
    exportedNamedFormulas,
  );
  const namedFormulaPlan = planNamedFormulaImport(
    exportedNamedFormulas,
    oldestFirst,
    createId,
  );

  const libraryQueries = oldestFirst
    .map(toExportItem)
    .filter(isExportImportNamedQuery);
  const exportedQueries = exportedItems.filter(isExportImportNamedQuery);
  const queriesToCreate: ExportImportNamedQuery[] = [];
  const newIds = new Map<string, string>();
  const cardQueryItems = new Map<string, ExportImportFormulaLibraryQuery>();
  // Exported AQL query names that the import changes, keyed by the old name
  const queryRenames = new Map<string, string>();
  // The new names, keyed by the exported id
  const newNames = new Map<string, string>();
  const usedQueryNames = [
    ...libraryQueries.map(item => item.name),
    ...exportedQueries.map(item => item.name),
  ];

  for (const exportedItem of exportedQueries) {
    const existingItem = findLibraryNamedQuery(
      libraryQueries,
      exportedItem.name,
    );
    if (existingItem && isSameNamedQuery(existingItem, exportedItem)) {
      newIds.set(exportedItem.id, existingItem.id);
    } else if (existingItem && exportedItem.type === 'query') {
      cardQueryItems.set(exportedItem.id, exportedItem);
    } else {
      // A card query cannot be an AQL query, so a different AQL query with
      // the same name gets a new name
      const name = existingItem
        ? findFreeQueryName(exportedItem.name, usedQueryNames)
        : exportedItem.name;
      if (name !== exportedItem.name) {
        queryRenames.set(exportedItem.name, name);
        newNames.set(exportedItem.id, name);
        usedQueryNames.push(name);
      }
      const newItem = { ...exportedItem, id: createId(), name };
      queriesToCreate.push(newItem);
      libraryQueries.push(newItem);
      newIds.set(exportedItem.id, newItem.id);
    }
  }

  const newWidgets = widgets.map(widget => {
    const { type, meta } = widget;
    if (!isFormulaMeta(type, meta)) return widget;

    const usedNames = findLibraryQueryNames(meta, exportedNamedFormulaFormulas);
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
          const name = newNames.get(exportedId) ?? override.name;
          return newId ? [[newId, { ...override, name }]] : [];
        },
      ),
    );

    // A name that a card named formula hides is not the library named formula, and a
    // name that a card query hides is not the library query
    const cardRenames = new Map(
      [...namedFormulaPlan.renames].filter(
        ([oldName]) => !isCardNamedFormulaName(meta, oldName),
      ),
    );
    const cardQueryRenames = new Map(
      [...queryRenames].filter(
        ([oldName]) => findLocalQueryName(meta, oldName) === undefined,
      ),
    );
    const renameFormula = (formula: string) =>
      renameQueries(
        renameNamedFormulas(formula, cardRenames),
        cardQueryRenames,
      );
    const rename = (formula: string | undefined) =>
      formula === undefined ? undefined : renameFormula(formula);

    return {
      ...widget,
      meta: {
        ...meta,
        ...((cardRenames.size > 0 || cardQueryRenames.size > 0) && {
          formula: rename(meta.formula),
          colorFormula: rename(meta.colorFormula),
          ...(meta.namedFormulas && {
            namedFormulas: Object.fromEntries(
              Object.entries(meta.namedFormulas).map(([name, namedFormula]) => [
                name,
                {
                  ...namedFormula,
                  formula: renameFormula(namedFormula.formula),
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
    itemsToCreate: [
      ...queriesToCreate,
      // An imported named formula uses the new names of the AQL queries
      ...namedFormulaPlan.itemsToCreate.map(item => ({
        ...item,
        data: {
          ...item.data,
          formula: renameQueries(item.data.formula, queryRenames),
        },
      })),
    ],
  };
}
