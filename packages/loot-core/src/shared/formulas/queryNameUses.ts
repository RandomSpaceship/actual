import type {
  FormulaLibraryItemEntity,
  FormulaLibraryNamedQueryEntity,
} from '#types/models';

// Functions whose first argument is a query name
const QUERY_NAME_FUNCTIONS = new Set([
  'QUERY',
  'QUERY_COUNT',
  'QUERY_EXTRACT_CATEGORIES',
  'QUERY_EXTRACT_TIMEFRAME_START',
  'QUERY_EXTRACT_TIMEFRAME_END',
  'QUERY_START_DATE',
  'QUERY_END_DATE',
  'QUERY_DAYS',
  'QUERY_GROUP',
  'QUERY_GROUP_COUNT',
  'QUERY_PIVOT',
  'QUERY_PIVOT_COUNT',
  'QUERY_TABLE',
]);

export type QueryNameReference = {
  name: string;
  // The position of the string literal in the formula, quotes included
  start: number;
  end: number;
};

function isIdentifierStart(character: string) {
  return /[A-Za-z_]/.test(character);
}

function isIdentifierPart(character: string) {
  return /[A-Za-z0-9_.]/.test(character);
}

function skipWhitespace(formula: string, index: number) {
  while (index < formula.length && /\s/.test(formula[index])) {
    index++;
  }
  return index;
}

// Returns the index after the closing quote, or -1 if the string does not end.
// A quote inside the string is written as two quotes.
function skipString(formula: string, index: number) {
  index++;
  while (index < formula.length) {
    if (formula[index] === '"') {
      if (formula[index + 1] === '"') {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index++;
  }
  return -1;
}

// Finds the query names that a formula gives as a string literal, for example
// QUERY("food"). A name built at run time, for example QUERY("fo"&"od"), is
// not found: the literal must be the whole argument.
export function findQueryNameReferences(formula: string): QueryNameReference[] {
  const references: QueryNameReference[] = [];
  let index = 0;

  while (index < formula.length) {
    const character = formula[index];

    if (character === '"') {
      const stringEnd = skipString(formula, index);
      if (stringEnd === -1) break;
      index = stringEnd;
      continue;
    }

    if (!isIdentifierStart(character)) {
      index++;
      continue;
    }

    const identifierStart = index;
    while (index < formula.length && isIdentifierPart(formula[index])) {
      index++;
    }
    const identifier = formula.slice(identifierStart, index).toUpperCase();
    if (!QUERY_NAME_FUNCTIONS.has(identifier)) continue;

    let argumentIndex = skipWhitespace(formula, index);
    if (formula[argumentIndex] !== '(') continue;
    argumentIndex = skipWhitespace(formula, argumentIndex + 1);
    if (formula[argumentIndex] !== '"') continue;

    const literalEnd = skipString(formula, argumentIndex);
    if (literalEnd === -1) break;

    const afterLiteral = formula[skipWhitespace(formula, literalEnd)];
    if (afterLiteral === ',' || afterLiteral === ';' || afterLiteral === ')') {
      references.push({
        name: formula
          .slice(argumentIndex + 1, literalEnd - 1)
          .replace(/""/g, '"'),
        start: argumentIndex,
        end: literalEnd,
      });
    }
    index = literalEnd;
  }

  return references;
}

export function isSameQueryName(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

// Filter queries and AQL queries share one set of names
export function isNamedQueryItem(
  item: FormulaLibraryItemEntity,
): item is FormulaLibraryNamedQueryEntity {
  return item.type === 'query' || item.type === 'aql-query';
}

// Items of the same kind cannot have the same name
export function getLibraryNameKind(type: FormulaLibraryItemEntity['type']) {
  return type === 'provider' ? 'provider' : 'query';
}

export function formulaUsesQueryName(formula: string, name: string) {
  return findQueryNameReferences(formula).some(reference =>
    isSameQueryName(reference.name, name),
  );
}

export function renameQueryInFormula(
  formula: string,
  oldName: string,
  newName: string,
) {
  const literal = `"${newName.replace(/"/g, '""')}"`;
  let renamed = formula;

  // Replace from the end, so that the earlier positions stay correct
  for (const reference of findQueryNameReferences(formula).reverse()) {
    if (isSameQueryName(reference.name, oldName)) {
      renamed =
        renamed.slice(0, reference.start) +
        literal +
        renamed.slice(reference.end);
    }
  }

  return renamed;
}
