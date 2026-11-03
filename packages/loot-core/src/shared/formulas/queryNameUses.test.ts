import {
  findQueryNameReferences,
  formulaUsesQueryName,
  renameQueryInFormula,
} from './queryNameUses';

describe('findQueryNameReferences', () => {
  it('finds the name in each query function', () => {
    const formula =
      '=QUERY("food") + QUERY_COUNT("rent") + COUNTA(QUERY_EXTRACT_CATEGORIES("bills")) & QUERY_EXTRACT_TIMEFRAME_START("a") & QUERY_EXTRACT_TIMEFRAME_END("b")';

    expect(
      findQueryNameReferences(formula).map(reference => reference.name),
    ).toEqual(['food', 'rent', 'bills', 'a', 'b']);
  });

  it('ignores the case of function names and allows whitespace', () => {
    expect(findQueryNameReferences('=query ( "food" )')).toEqual([
      { name: 'food', start: 9, end: 15 },
    ]);
  });

  it('reads a quote written as two quotes', () => {
    expect(findQueryNameReferences('=QUERY("say ""hi""")')[0].name).toBe(
      'say "hi"',
    );
  });

  it('does not find names built at run time', () => {
    expect(findQueryNameReferences('=QUERY("fo"&"od")')).toEqual([]);
    expect(findQueryNameReferences('=QUERY(A1)')).toEqual([]);
  });

  it('does not find function names inside strings or other names', () => {
    expect(findQueryNameReferences('="QUERY(""food"")"')).toEqual([]);
    expect(findQueryNameReferences('=MYQUERY("food")')).toEqual([]);
    expect(findQueryNameReferences('=BUDGET_QUERY("goal")')).toEqual([]);
  });

  it('stops at a string that does not end', () => {
    expect(findQueryNameReferences('=QUERY("food')).toEqual([]);
  });
});

describe('formulaUsesQueryName', () => {
  it('ignores case in names', () => {
    expect(formulaUsesQueryName('=QUERY("Food")', 'food')).toBe(true);
    expect(formulaUsesQueryName('=QUERY("Food")', 'rent')).toBe(false);
  });
});

describe('renameQueryInFormula', () => {
  it('renames every use and keeps the rest of the formula', () => {
    expect(
      renameQueryInFormula(
        '=QUERY("food") / QUERY_COUNT( "FOOD" ) + QUERY("rent")',
        'food',
        'groceries',
      ),
    ).toBe('=QUERY("groceries") / QUERY_COUNT( "groceries" ) + QUERY("rent")');
  });

  it('writes a quote in the new name as two quotes', () => {
    expect(renameQueryInFormula('=QUERY("a")', 'a', 'say "hi"')).toBe(
      '=QUERY("say ""hi""")',
    );
  });

  it('does not change a name built at run time', () => {
    expect(renameQueryInFormula('=QUERY("fo"&"od")', 'food', 'x')).toBe(
      '=QUERY("fo"&"od")',
    );
  });
});
