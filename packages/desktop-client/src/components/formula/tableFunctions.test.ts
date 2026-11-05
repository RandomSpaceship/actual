import type { FormulaLibraryItemEntity } from '@actual-app/core/types/models';
import { describe, expect, it, vi } from 'vitest';

import { executeFormula } from './executeFormula';
import { resolveQuery } from './resolveQuery';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(async () => undefined),
}));

// As QUERY_GROUP("q", "category group", , "category") gives
const spending =
  '{"Bills","Rent",-20;"Bills","Power",-50;"Food","Groceries",-120}';

function namedFormula(name: string, formula: string): FormulaLibraryItemEntity {
  return {
    id: name,
    type: 'named-formula',
    name,
    data: { formula },
    created_at: 0,
  };
}

async function run(formula: string, library: FormulaLibraryItemEntity[] = []) {
  const result = await executeFormula({
    formula,
    resolveQuery: name => resolveQuery(name, { localQueries: {}, library }),
    accounts: [],
    library,
    language: 'en-US',
    output: 'table',
  });
  return result.table ?? result.value;
}

describe('CHOOSECOLS and CHOOSEROWS', () => {
  it('picks columns by number, also from the end', async () => {
    expect(await run(`=CHOOSECOLS(${spending}, 3)`)).toEqual([
      [-20],
      [-50],
      [-120],
    ]);
    expect(await run(`=CHOOSECOLS(${spending}, -1, 1)`)).toEqual([
      [-20, 'Bills'],
      [-50, 'Bills'],
      [-120, 'Food'],
    ]);
  });

  it('picks rows by number', async () => {
    expect(await run(`=CHOOSEROWS(${spending}, 3, 1)`)).toEqual([
      ['Food', 'Groceries', -120],
      ['Bills', 'Rent', -20],
    ]);
  });

  it('gives an error for an index past the table', async () => {
    await expect(run(`=CHOOSECOLS(${spending}, 4)`)).rejects.toThrow(
      'Use an index from 1 to 3',
    );
    await expect(run(`=CHOOSEROWS(${spending}, 0)`)).rejects.toThrow(
      'Use an index from 1 to 3',
    );
  });
});

describe('TAKE and DROP', () => {
  it('takes rows and columns from the start or the end', async () => {
    expect(await run(`=TAKE(${spending}, 2)`)).toEqual([
      ['Bills', 'Rent', -20],
      ['Bills', 'Power', -50],
    ]);
    expect(await run(`=TAKE(${spending}, -1, -2)`)).toEqual([
      ['Groceries', -120],
    ]);
    // A count past the size takes all
    expect(await run(`=TAKE(${spending}, 10, 1)`)).toEqual([
      ['Bills'],
      ['Bills'],
      ['Food'],
    ]);
  });

  it('drops rows and columns from the start or the end', async () => {
    expect(await run(`=DROP(${spending}, 1, 1)`)).toEqual([
      ['Power', -50],
      ['Groceries', -120],
    ]);
    expect(await run(`=DROP(${spending}, , -1)`)).toEqual([
      ['Bills', 'Rent'],
      ['Bills', 'Power'],
      ['Food', 'Groceries'],
    ]);
  });

  it('gives an error when no rows are left', async () => {
    await expect(run(`=DROP(${spending}, 3)`)).rejects.toThrow();
  });
});

describe('FILTER', () => {
  it('keeps the rows of a table that match', async () => {
    expect(
      await run(`=FILTER(${spending}, CHOOSECOLS(${spending}, 3) < -30)`),
    ).toEqual([
      ['Bills', 'Power', -50],
      ['Food', 'Groceries', -120],
    ]);
  });

  it('joins conditions with * for and', async () => {
    const amounts = `CHOOSECOLS(${spending}, 3)`;
    expect(
      await run(
        `=FILTER(${spending}, (${amounts} < -30) * (${amounts} > -100))`,
      ),
    ).toEqual([['Bills', 'Power', -50]]);
  });

  it('joins conditions with + for or', async () => {
    const amounts = `CHOOSECOLS(${spending}, 3)`;
    expect(
      await run(
        `=FILTER(${spending}, (${amounts} > -30) + (${amounts} < -100))`,
      ),
    ).toEqual([
      ['Bills', 'Rent', -20],
      ['Food', 'Groceries', -120],
    ]);
  });

  it('keeps the columns of a table with a one-row include', async () => {
    expect(await run(`=FILTER(${spending}, {1, 0, 1})`)).toEqual([
      ['Bills', -20],
      ['Bills', -50],
      ['Food', -120],
    ]);
  });

  it('still filters one column', async () => {
    expect(await run('=FILTER({1;2;3}, {1;0;1})')).toEqual([[1], [3]]);
  });

  it('gives the if-empty value when no rows match', async () => {
    expect(
      await run(`=FILTER(${spending}, CHOOSECOLS(${spending}, 3) > 0, "None")`),
    ).toEqual([['None']]);
    await expect(
      run(`=FILTER(${spending}, CHOOSECOLS(${spending}, 3) > 0)`),
    ).rejects.toThrow('No rows match');
  });

  it('gives an error for an include of the wrong size', async () => {
    await expect(run(`=FILTER(${spending}, {1;0})`)).rejects.toThrow(
      'The include argument must be one column',
    );
  });

  it('filters a table named formula by its amount column', async () => {
    expect(
      await run('=FILTER(Spending, CHOOSECOLS(Spending, 3) < -30)', [
        namedFormula('Spending', `=${spending}`),
      ]),
    ).toEqual([
      ['Bills', 'Power', -50],
      ['Food', 'Groceries', -120],
    ]);
  });

  it('gives a named formula only the rows that match', async () => {
    // FILTER gets space for 3 rows before it runs, but 2 rows match
    expect(
      await run('=ROWS(Matches)', [
        namedFormula(
          'Matches',
          `=FILTER(${spending}, CHOOSECOLS(${spending}, 3) < -30)`,
        ),
      ]),
    ).toEqual([[2]]);
  });
});
