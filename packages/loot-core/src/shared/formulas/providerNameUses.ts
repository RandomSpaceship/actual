// A formula refers to a provider by its name without quotes, for example
// =NetIncome / 12. HyperFormula reads such a name as a named expression.

// The letters that HyperFormula allows in a named expression
const LETTERS = 'A-Za-z\\u00C0-\\u02AF';
const NAME_PATTERN = new RegExp(`^[${LETTERS}_][${LETTERS}0-9_.]*$`);
const A1_REFERENCE_PATTERN = /^\$?[A-Za-z]+\$?[0-9]+$/;
const R1C1_REFERENCE_PATTERN = /^[rR][0-9]*[cC][0-9]*$/;
const NAME_START = new RegExp(`[${LETTERS}_$]`);
const NAME_PART = new RegExp(`[${LETTERS}0-9_.$]`);

// The color formula gets RESULT and the theme_ colors as named expressions
const RESERVED_NAMES = new Set(['RESULT', 'TRUE', 'FALSE']);
const RESERVED_PREFIX = 'THEME_';

export type ProviderNameReference = {
  name: string;
  start: number;
  end: number;
};

export function isSameProviderName(a: string, b: string) {
  return a.toUpperCase() === b.toUpperCase();
}

export function isReservedProviderName(name: string) {
  const upperName = name.toUpperCase();
  return RESERVED_NAMES.has(upperName) || upperName.startsWith(RESERVED_PREFIX);
}

// The HyperFormula named-expression rules, and no reserved name
export function isValidProviderName(name: string) {
  return (
    NAME_PATTERN.test(name) &&
    !A1_REFERENCE_PATTERN.test(name) &&
    !R1C1_REFERENCE_PATTERN.test(name) &&
    !isReservedProviderName(name)
  );
}

function skipWhitespace(formula: string, index: number) {
  while (index < formula.length && /\s/.test(formula[index])) {
    index++;
  }
  return index;
}

// Returns the index after the closing quote, or -1 if the text does not end.
// A quote inside the text is written as two quotes.
function skipQuoted(formula: string, index: number) {
  const quote = formula[index];
  index++;
  while (index < formula.length) {
    if (formula[index] === quote) {
      if (formula[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index++;
  }
  return -1;
}

// Finds the names in a formula that are not functions, cell references, sheet
// names, or text. Each one is a provider name or an unknown name.
export function findProviderNameReferences(
  formula: string,
): ProviderNameReference[] {
  const references: ProviderNameReference[] = [];
  let index = 0;

  while (index < formula.length) {
    const character = formula[index];

    if (character === '"' || character === "'") {
      const quotedEnd = skipQuoted(formula, index);
      if (quotedEnd === -1) break;
      index = quotedEnd;
      continue;
    }

    // A number, for example 1.5E3
    if (/[0-9.]/.test(character)) {
      const number = /^[0-9.]+([eE][+-]?[0-9]+)?/.exec(formula.slice(index));
      index += number ? number[0].length : 1;
      continue;
    }

    if (!NAME_START.test(character)) {
      index++;
      continue;
    }

    const start = index;
    while (index < formula.length && NAME_PART.test(formula[index])) {
      index++;
    }
    const name = formula.slice(start, index);
    const next = formula[skipWhitespace(formula, index)];
    const isFunction = next === '(';
    const isSheetName = next === '!';
    const isRange = next === ':' || formula[start - 1] === ':';

    if (!isFunction && !isSheetName && !isRange && isValidProviderName(name)) {
      references.push({ name, start, end: index });
    }
  }

  return references;
}

export function formulaUsesProviderName(formula: string, name: string) {
  return findProviderNameReferences(formula).some(reference =>
    isSameProviderName(reference.name, name),
  );
}

export function renameProviderInFormula(
  formula: string,
  oldName: string,
  newName: string,
) {
  let renamed = formula;

  // Replace from the end, so that the earlier positions stay correct
  for (const reference of findProviderNameReferences(formula).reverse()) {
    if (isSameProviderName(reference.name, oldName)) {
      renamed =
        renamed.slice(0, reference.start) +
        newName +
        renamed.slice(reference.end);
    }
  }

  return renamed;
}
