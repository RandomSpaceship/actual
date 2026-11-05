import { v4 as uuidv4 } from 'uuid';

import { createApp } from '#server/app';
import { aqlQuery } from '#server/aql';
import * as db from '#server/db';
import { ValidationError } from '#server/errors';
import { mutator } from '#server/mutators';
import { batchMessages } from '#server/sync';
import { undoable } from '#server/undo';
import {
  isValidNamedFormulaName,
  renameNamedFormulaInFormula,
} from '#shared/formulas/namedFormulaNameUses';
import {
  getLibraryNameKind,
  isSameQueryName,
  renameQueryInFormula,
} from '#shared/formulas/queryNameUses';
import { q } from '#shared/query';
import type { FormulaLibraryItemEntity, FormulaWidget } from '#types/models';

export type FormulaLibraryHandlers = {
  'formula-library-create': typeof createItem;
  'formula-library-update': typeof updateItem;
  'formula-library-delete': typeof deleteItem;
};

export const app = createApp<FormulaLibraryHandlers>();
app.method('formula-library-create', mutator(undoable(createItem)));
app.method('formula-library-update', mutator(undoable(updateItem)));
app.method('formula-library-delete', mutator(undoable(deleteItem)));

async function getItems(): Promise<FormulaLibraryItemEntity[]> {
  const { data } = await aqlQuery(q('formula_library').select('*'));
  return data as FormulaLibraryItemEntity[];
}

// Duplicate names can still come from sync. Then the oldest item wins
async function validateName(
  type: FormulaLibraryItemEntity['type'],
  name: string,
  id?: FormulaLibraryItemEntity['id'],
) {
  if (name.trim() === '') {
    throw new ValidationError('A formula library item must have a name');
  }
  if (type === 'named-formula' && !isValidNamedFormulaName(name)) {
    throw new ValidationError(`"${name}" cannot be a named formula name`);
  }

  const items = await getItems();
  if (
    items.some(
      item =>
        item.id !== id &&
        getLibraryNameKind(item.type) === getLibraryNameKind(type) &&
        isSameQueryName(item.name, name),
    )
  ) {
    throw new ValidationError(`The name "${name}" is already in use`);
  }
}

async function createItem({
  type,
  name,
  data,
}: Pick<FormulaLibraryItemEntity, 'type' | 'name' | 'data'>): Promise<
  FormulaLibraryItemEntity['id']
> {
  await validateName(type, name);

  const id = uuidv4();
  await db.insertWithSchema('formula_library', {
    id,
    type,
    name,
    data,
    created_at: Date.now(),
  });
  return id;
}

// A rename changes the formula text of the cards in renameInWidgetIds, in the
// same batch, so that one undo reverts all of it, also in card named formulas. A
// card with a card query or card named formula that has the old name does not use
// the library item, so it does not change.
// The rename also changes every named formula that uses the item. An item that an
// older item with the same name overrides has no uses, so nothing else changes.
async function updateItem({
  id,
  name,
  data,
  renameInWidgetIds = [],
}: Pick<FormulaLibraryItemEntity, 'id'> &
  Partial<Pick<FormulaLibraryItemEntity, 'name' | 'data'>> & {
    renameInWidgetIds?: string[];
  }): Promise<void> {
  const items = await getItems();
  const item = items.find(candidate => candidate.id === id);
  if (!item) {
    throw new ValidationError(`Formula library item ${id} not found`);
  }

  const isRename = name !== undefined && name !== item.name;
  if (isRename) {
    await validateName(item.type, name, id);
  }

  // The oldest item with the name is the one that formulas use
  const isUsedItem =
    items.find(
      candidate =>
        getLibraryNameKind(candidate.type) === getLibraryNameKind(item.type) &&
        isSameQueryName(candidate.name, item.name),
    )?.id === id;
  const rename = (formula: string) =>
    item.type === 'named-formula'
      ? renameNamedFormulaInFormula(formula, item.name, name ?? item.name)
      : renameQueryInFormula(formula, item.name, name ?? item.name);

  const widgets =
    isRename && renameInWidgetIds.length > 0
      ? ((
          await aqlQuery(
            q('dashboard')
              .filter({
                type: 'formula-card',
                id: { $oneof: renameInWidgetIds },
              })
              .select('*'),
          )
        ).data as FormulaWidget[])
      : [];

  await batchMessages(async () => {
    await db.updateWithSchema('formula_library', {
      id,
      ...(name !== undefined && { name }),
      ...(data !== undefined && { data }),
    });

    if (!isRename) return;

    for (const widget of widgets) {
      const meta = widget.meta;
      const localNames = Object.keys(
        (item.type === 'named-formula' ? meta?.namedFormulas : meta?.queries) ??
          {},
      );
      if (
        !meta ||
        localNames.some(localName => isSameQueryName(localName, item.name))
      ) {
        continue;
      }

      await db.updateWithSchema('dashboard', {
        id: widget.id,
        meta: {
          ...meta,
          formula:
            meta.formula === undefined ? undefined : rename(meta.formula),
          colorFormula:
            meta.colorFormula === undefined
              ? undefined
              : rename(meta.colorFormula),
          ...(meta.namedFormulas && {
            namedFormulas: Object.fromEntries(
              Object.entries(meta.namedFormulas).map(([name, namedFormula]) => [
                name,
                { ...namedFormula, formula: rename(namedFormula.formula) },
              ]),
            ),
          }),
        },
      });
    }

    if (!isUsedItem) return;

    for (const namedFormula of items) {
      if (namedFormula.type !== 'named-formula') continue;
      // The item itself has the new name and data already
      const namedFormulaData =
        namedFormula.id === id && data ? data : namedFormula.data;
      if (!('formula' in namedFormulaData)) continue;

      const formula = rename(namedFormulaData.formula);
      if (formula !== namedFormulaData.formula) {
        await db.updateWithSchema('formula_library', {
          id: namedFormula.id,
          data: { ...namedFormulaData, formula },
        });
      }
    }
  });
}

async function deleteItem({
  id,
}: Pick<FormulaLibraryItemEntity, 'id'>): Promise<void> {
  await db.delete_('formula_library', id);
}
