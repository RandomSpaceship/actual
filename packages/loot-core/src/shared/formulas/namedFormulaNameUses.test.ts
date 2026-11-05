import {
  findNamedFormulaNameReferences,
  formulaUsesNamedFormulaName,
  isValidNamedFormulaName,
  renameNamedFormulaInFormula,
} from './namedFormulaNameUses';

function names(formula: string) {
  return findNamedFormulaNameReferences(formula).map(
    reference => reference.name,
  );
}

describe('isValidNamedFormulaName', () => {
  it('allows letters, digits, underscores and periods', () => {
    expect(isValidNamedFormulaName('NetIncome')).toBe(true);
    expect(isValidNamedFormulaName('net_income.2024')).toBe(true);
    expect(isValidNamedFormulaName('_total')).toBe(true);
    expect(isValidNamedFormulaName('Café')).toBe(true);
  });

  it('rejects spaces, a digit at the start, and other characters', () => {
    expect(isValidNamedFormulaName('Net income')).toBe(false);
    expect(isValidNamedFormulaName('2024total')).toBe(false);
    expect(isValidNamedFormulaName('net-income')).toBe(false);
    expect(isValidNamedFormulaName('')).toBe(false);
  });

  it('rejects names that look like a cell reference', () => {
    expect(isValidNamedFormulaName('AB12')).toBe(false);
    expect(isValidNamedFormulaName('r1c1')).toBe(false);
    expect(isValidNamedFormulaName('RC')).toBe(false);
    expect(isValidNamedFormulaName('AB12x')).toBe(true);
  });

  it('rejects the names that the color formula uses', () => {
    expect(isValidNamedFormulaName('Result')).toBe(false);
    expect(isValidNamedFormulaName('theme_pageText')).toBe(false);
    expect(isValidNamedFormulaName('TRUE')).toBe(false);
  });
});

describe('findNamedFormulaNameReferences', () => {
  it('finds names that are not functions', () => {
    expect(
      findNamedFormulaNameReferences('=NetIncome / 12 + SUM(Rent, 1.5E3)'),
    ).toEqual([
      { name: 'NetIncome', start: 1, end: 10 },
      { name: 'Rent', start: 22, end: 26 },
    ]);
  });

  it('does not find text, cell references, ranges or sheet names', () => {
    expect(names('="NetIncome" & A1 & $B$2 & SUM(A:A) & Sheet1!C3')).toEqual(
      [],
    );
    expect(names("='My sheet'!A1")).toEqual([]);
  });

  it('does not find RESULT, theme colors or booleans', () => {
    expect(names('=IF(RESULT > 0, theme_pageText, TRUE)')).toEqual([]);
  });

  it('finds a name next to a query function', () => {
    expect(names('=QUERY("food") - Budget')).toEqual(['Budget']);
  });
});

describe('formulaUsesNamedFormulaName', () => {
  it('ignores case', () => {
    expect(formulaUsesNamedFormulaName('=netincome * 2', 'NetIncome')).toBe(
      true,
    );
    expect(formulaUsesNamedFormulaName('="NetIncome"', 'NetIncome')).toBe(
      false,
    );
  });
});

describe('renameNamedFormulaInFormula', () => {
  it('renames each use and leaves text and longer names unchanged', () => {
    expect(
      renameNamedFormulaInFormula(
        '=Net + net * 2 & "Net" & NetTotal',
        'Net',
        'NetIncome',
      ),
    ).toBe('=NetIncome + NetIncome * 2 & "Net" & NetTotal');
  });
});
