import {
  findProviderNameReferences,
  formulaUsesProviderName,
  isValidProviderName,
  renameProviderInFormula,
} from './providerNameUses';

function names(formula: string) {
  return findProviderNameReferences(formula).map(reference => reference.name);
}

describe('isValidProviderName', () => {
  it('allows letters, digits, underscores and periods', () => {
    expect(isValidProviderName('NetIncome')).toBe(true);
    expect(isValidProviderName('net_income.2024')).toBe(true);
    expect(isValidProviderName('_total')).toBe(true);
    expect(isValidProviderName('Café')).toBe(true);
  });

  it('rejects spaces, a digit at the start, and other characters', () => {
    expect(isValidProviderName('Net income')).toBe(false);
    expect(isValidProviderName('2024total')).toBe(false);
    expect(isValidProviderName('net-income')).toBe(false);
    expect(isValidProviderName('')).toBe(false);
  });

  it('rejects names that look like a cell reference', () => {
    expect(isValidProviderName('AB12')).toBe(false);
    expect(isValidProviderName('r1c1')).toBe(false);
    expect(isValidProviderName('RC')).toBe(false);
    expect(isValidProviderName('AB12x')).toBe(true);
  });

  it('rejects the names that the color formula uses', () => {
    expect(isValidProviderName('Result')).toBe(false);
    expect(isValidProviderName('theme_pageText')).toBe(false);
    expect(isValidProviderName('TRUE')).toBe(false);
  });
});

describe('findProviderNameReferences', () => {
  it('finds names that are not functions', () => {
    expect(
      findProviderNameReferences('=NetIncome / 12 + SUM(Rent, 1.5E3)'),
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

describe('formulaUsesProviderName', () => {
  it('ignores case', () => {
    expect(formulaUsesProviderName('=netincome * 2', 'NetIncome')).toBe(true);
    expect(formulaUsesProviderName('="NetIncome"', 'NetIncome')).toBe(false);
  });
});

describe('renameProviderInFormula', () => {
  it('renames each use and leaves text and longer names unchanged', () => {
    expect(
      renameProviderInFormula(
        '=Net + net * 2 & "Net" & NetTotal',
        'Net',
        'NetIncome',
      ),
    ).toBe('=NetIncome + NetIncome * 2 & "Net" & NetTotal');
  });
});
