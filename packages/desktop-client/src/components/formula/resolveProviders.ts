import {
  findProviderNameReferences,
  isSameProviderName,
} from '@actual-app/core/shared/formulas/providerNameUses';
import type { FormulaLibraryItemEntity } from '@actual-app/core/types/models';
import { t } from 'i18next';

import type { FormulaIssue } from './resolveQuery';

export type ResolvedProvider = {
  name: string;
  formula: string;
  // The provider names that the formula uses, as written
  uses: string[];
};

// Finds the library providers that the formulas use, also through other
// providers. Only these go into the workbook.
//
// Names are case-insensitive, and the oldest provider wins a duplicate name
// (with a warning), as for library queries. A name in otherNames (for example
// RESULT in a color formula) is not a provider.
export function resolveProviders(
  formulas: string[],
  // Oldest first
  library: FormulaLibraryItemEntity[],
  otherNames: string[] = [],
): { providers: ResolvedProvider[]; issues: FormulaIssue[] } {
  const providers = new Map<string, ResolvedProvider>();
  const issues: FormulaIssue[] = [];
  // The providers that the walk is in now, to find a cycle
  const path: string[] = [];

  function visit(name: string) {
    if (otherNames.some(otherName => isSameProviderName(otherName, name))) {
      return;
    }

    const key = name.toUpperCase();
    const cycleStart = path.indexOf(key);
    if (cycleStart !== -1) {
      const cycle = path
        .slice(cycleStart)
        .map(pathKey => providers.get(pathKey)?.name ?? pathKey);
      if (!issues.some(issue => issue.kind === 'provider-cycle')) {
        issues.push({
          severity: 'error',
          kind: 'provider-cycle',
          name: cycle[0],
          message:
            cycle.length === 1
              ? t('Provider "{{name}}" uses itself', { name: cycle[0] })
              : t('Providers {{names}} use each other', {
                  names: cycle.map(cycleName => `"${cycleName}"`).join(', '),
                }),
        });
      }
      return;
    }
    if (providers.has(key)) return;

    const matches = library.filter(
      item => item.type === 'provider' && isSameProviderName(item.name, name),
    );
    const [item] = matches;
    if (!item || item.type !== 'provider') {
      issues.push({
        severity: 'error',
        kind: 'missing-provider',
        name,
        message: t('Provider "{{name}}" not found', { name }),
      });
      return;
    }
    if (matches.length > 1) {
      issues.push({
        severity: 'warning',
        kind: 'duplicate-name',
        name,
        message: t(
          'More than one provider is named "{{name}}". The oldest one is used',
          { name: item.name },
        ),
      });
    }

    const uses = findProviderNameReferences(item.data.formula).map(
      reference => reference.name,
    );
    providers.set(key, { name: item.name, formula: item.data.formula, uses });
    path.push(key);
    uses.forEach(visit);
    path.pop();
  }

  for (const formula of formulas) {
    findProviderNameReferences(formula).forEach(reference =>
      visit(reference.name),
    );
  }

  return { providers: [...providers.values()], issues };
}

// The provider names for autocomplete, with the formula of each. For
// providers with the same name, only the oldest is in the list.
export function listProviderNames(
  // Oldest first
  library: FormulaLibraryItemEntity[],
): Record<string, string> {
  const providers: Record<string, string> = {};
  for (const item of library) {
    if (
      item.type === 'provider' &&
      !Object.keys(providers).some(name => isSameProviderName(name, item.name))
    ) {
      providers[item.name] = item.data.formula;
    }
  }
  return providers;
}
