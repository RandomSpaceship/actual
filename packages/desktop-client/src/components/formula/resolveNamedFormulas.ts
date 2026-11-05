import {
  findNamedFormulaNameReferences,
  isSameNamedFormulaName,
} from '@actual-app/core/shared/formulas/namedFormulaNameUses';
import type {
  FormulaLibraryItemEntity,
  FormulaLibraryNamedFormulaData,
} from '@actual-app/core/types/models';
import { t } from 'i18next';

import type { FormulaIssue } from './resolveQuery';

// The card's own named formulas, keyed by name
export type CardNamedFormulas = Record<string, FormulaLibraryNamedFormulaData>;

export type ResolvedNamedFormula = {
  name: string;
  formula: string;
  // The named formula names that the formula uses, as written
  uses: string[];
};

// Finds the named formulas that the formulas use, also through other named formulas.
// Only these go into the workbook.
//
// Names are case-insensitive. A card named formula wins over a library named formula
// with the same name (with a warning), also when a library named formula uses the
// name. For card named formulas an exact match wins. For library named formulas the
// oldest named formula wins a duplicate name (with a warning), as for library
// queries. A name in otherNames (for example RESULT in a color formula) is
// not a named formula.
export function resolveNamedFormulas(
  formulas: string[],
  // Oldest first
  library: FormulaLibraryItemEntity[],
  otherNames: string[] = [],
  cardNamedFormulas: CardNamedFormulas = {},
): { namedFormulas: ResolvedNamedFormula[]; issues: FormulaIssue[] } {
  const namedFormulas = new Map<string, ResolvedNamedFormula>();
  const issues: FormulaIssue[] = [];
  // The named formulas that the walk is in now, to find a cycle
  const path: string[] = [];

  function visit(name: string) {
    if (otherNames.some(otherName => isSameNamedFormulaName(otherName, name))) {
      return;
    }

    const key = name.toUpperCase();
    const cycleStart = path.indexOf(key);
    if (cycleStart !== -1) {
      const cycle = path
        .slice(cycleStart)
        .map(pathKey => namedFormulas.get(pathKey)?.name ?? pathKey);
      if (!issues.some(issue => issue.kind === 'named-formula-cycle')) {
        issues.push({
          severity: 'error',
          kind: 'named-formula-cycle',
          name: cycle[0],
          message:
            cycle.length === 1
              ? t('Named formula "{{name}}" uses itself', { name: cycle[0] })
              : t('Named formulas {{names}} use each other', {
                  names: cycle.map(cycleName => `"${cycleName}"`).join(', '),
                }),
        });
      }
      return;
    }
    if (namedFormulas.has(key)) return;

    const matches = library.filter(
      item =>
        item.type === 'named-formula' &&
        isSameNamedFormulaName(item.name, name),
    );

    const cardName = findCardNamedFormulaName(cardNamedFormulas, name);
    if (cardName !== undefined) {
      if (matches.length > 0) {
        issues.push({
          severity: 'warning',
          kind: 'shadowed',
          name,
          message: t(
            'The card named formula "{{name}}" hides the library named formula',
            { name: cardName },
          ),
        });
      }
      add(key, cardName, cardNamedFormulas[cardName].formula);
      return;
    }

    const [item] = matches;
    if (!item || item.type !== 'named-formula') {
      issues.push({
        severity: 'error',
        kind: 'missing-named-formula',
        name,
        message: t('Named formula "{{name}}" not found', { name }),
      });
      return;
    }
    if (matches.length > 1) {
      issues.push({
        severity: 'warning',
        kind: 'duplicate-name',
        name,
        message: t(
          'More than one named formula is named "{{name}}". The oldest one is used',
          { name: item.name },
        ),
      });
    }

    add(key, item.name, item.data.formula);
  }

  function add(key: string, name: string, formula: string) {
    const uses = findNamedFormulaNameReferences(formula).map(
      reference => reference.name,
    );
    namedFormulas.set(key, { name, formula, uses });
    path.push(key);
    uses.forEach(visit);
    path.pop();
  }

  for (const formula of formulas) {
    findNamedFormulaNameReferences(formula).forEach(reference =>
      visit(reference.name),
    );
  }

  return { namedFormulas: [...namedFormulas.values()], issues };
}

// The card named formula with this name. An exact match wins.
export function findCardNamedFormulaName(
  cardNamedFormulas: CardNamedFormulas,
  name: string,
) {
  return Object.hasOwn(cardNamedFormulas, name)
    ? name
    : Object.keys(cardNamedFormulas).find(cardName =>
        isSameNamedFormulaName(cardName, name),
      );
}

// The named formula names for autocomplete, with the formula of each. A library
// name that a card named formula hides is not in the list. For library named formulas
// with the same name, only the oldest is in the list.
export function listNamedFormulaNames(
  // Oldest first
  library: FormulaLibraryItemEntity[],
  cardNamedFormulas: CardNamedFormulas = {},
): Record<string, string> {
  const namedFormulas: Record<string, string> = {};
  for (const [name, { formula }] of Object.entries(cardNamedFormulas)) {
    namedFormulas[name] = formula;
  }
  for (const item of library) {
    if (
      item.type === 'named-formula' &&
      !Object.keys(namedFormulas).some(name =>
        isSameNamedFormulaName(name, item.name),
      )
    ) {
      namedFormulas[item.name] = item.data.formula;
    }
  }
  return namedFormulas;
}
