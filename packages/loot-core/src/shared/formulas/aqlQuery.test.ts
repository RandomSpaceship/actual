import { aqlQuery } from '#server/aql';
import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';

import { parseAqlQuery } from './aqlQuery';

function parse(json: unknown) {
  return parseAqlQuery(JSON.stringify(json));
}

// The rows or the value of the query, from the test database
async function run(json: unknown) {
  const { query, error } = parse(json);
  if (error !== undefined) throw new Error(error);
  return (await aqlQuery(query.query)).data;
}

describe('parseAqlQuery', () => {
  it('finds the kind of the query', () => {
    expect(parse({ table: 'transactions' }).query?.kind).toBe('filter');
    expect(
      parse({ table: 'transactions', filter: { amount: { $lt: 0 } } }).query
        ?.kind,
    ).toBe('filter');
    expect(
      parse({ table: 'transactions', calculate: { $sum: '$amount' } }).query
        ?.kind,
    ).toBe('value');
    expect(parse({ table: 'transactions', limit: 5 }).query?.kind).toBe(
      'table',
    );
    expect(parse({ table: 'payees' }).query?.kind).toBe('table');
  });

  it('gives the columns of a table query, and the ones that read amount', () => {
    expect(
      parseAqlQuery(
        JSON.stringify({
          table: 'transactions',
          groupBy: ['payee.name'],
          select: [
            'payee.name',
            'parent.amount',
            { total: { $sum: '$amount' } },
            { count: { $count: '$id' } },
            { plain: 'amount' },
            { text: { $eq: ['$notes', 'amount'] } },
          ],
        }),
      ).query?.columns,
    ).toEqual([
      { name: 'payee.name', usesAmount: false },
      { name: 'parent.amount', usesAmount: true },
      { name: 'total', usesAmount: true },
      { name: 'count', usesAmount: false },
      { name: 'plain', usesAmount: true },
      { name: 'text', usesAmount: false },
    ]);
    // A * gives the columns only with the rows
    expect(
      parseAqlQuery('{"table": "payees", "select": ["id", "*"]}').query
        ?.columns,
    ).toBeNull();
    expect(parseAqlQuery('{"table": "payees"}').query?.columns).toBeNull();
  });

  it('marks a $count calculation as a count', () => {
    expect(
      parse({ table: 'transactions', calculate: { $count: '*' } }).query
        ?.isCountCalculation,
    ).toBe(true);
    expect(
      parse({ table: 'transactions', calculate: { $sum: '$amount' } }).query
        ?.isCountCalculation,
    ).toBe(false);
  });

  it('never makes a raw query or a query with deleted rows', () => {
    const { query } = parse({
      table: 'transactions',
      filter: { amount: 1 },
      options: { splits: 'all' },
    });
    expect(query?.query.state).toMatchObject({
      rawMode: false,
      withDead: false,
      validateRefs: true,
      tableOptions: { splits: 'all' },
    });
  });

  it('gives an error for text that is not a query', () => {
    expect(parseAqlQuery('{"table": ').error).toMatch(
      /^The query is not valid JSON/,
    );
    expect(parse(['transactions']).error).toMatch(/must be a JSON object/);
    expect(parse({}).error).toMatch(/Give the table/);
    expect(parse({ table: 'transactions', withDead: true }).error).toBe(
      'Unknown key "withDead". Use table, filter, options, groupBy, select, orderBy, calculate, limit, offset',
    );
    expect(parse({ table: 'transactions', options: { raw: true } }).error).toBe(
      'Unknown option "raw". Use splits',
    );
    expect(
      parse({ table: 'transactions', options: { splits: 'grouped' } }).error,
    ).toBe('splits must be "inline", "none", "all"');
    expect(parse({ table: 'transactions', limit: -1 }).error).toBe(
      'limit must be a whole number, 0 or more',
    );
    expect(parse({ table: 'transactions', select: [] }).error).toBe(
      'select must be a field name, an object, or a list of them',
    );
    expect(parse({ table: 'transactions', filter: 'amount' }).error).toMatch(
      /^filter must be an object/,
    );
    expect(
      parse({
        table: 'transactions',
        calculate: { $sum: '$amount' },
        groupBy: ['payee'],
      }).error,
    ).toMatch(/^A query with calculate gives one value/);
  });

  it('reads only the allowed tables', () => {
    expect(parse({ table: 'preferences' }).error).toBe(
      'Formulas cannot read the table "preferences". Use transactions, accounts, payees, categories, category_groups, schedules, zero_budgets, reflect_budgets',
    );
    expect(parse({ table: 'formula_library' }).error).toMatch(
      /^Formulas cannot read the table "formula_library"/,
    );
  });
});

describe('parseAqlQuery with the database', () => {
  beforeEach(async () => {
    await global.emptyDatabase()();
    await loadMappings();
    await db.insertAccount({ id: 'checking', name: 'Checking' });
    await db.insertPayee({ id: 'cafe', name: 'Corner Cafe' });
    await db.insertPayee({ id: 'shop', name: 'Shop' });
    await db.insertTransaction({
      id: 'coffee1',
      date: '2024-01-05',
      amount: -450,
      account: 'checking',
      payee: 'cafe',
    });
    await db.insertTransaction({
      id: 'coffee2',
      date: '2024-02-07',
      amount: -550,
      account: 'checking',
      payee: 'cafe',
    });
    await db.insertTransaction({
      id: 'food',
      date: '2024-02-08',
      amount: -10000,
      account: 'checking',
      payee: 'shop',
    });
    await db.insertTransaction({
      id: 'deleted',
      date: '2024-02-09',
      amount: -99999,
      account: 'checking',
      payee: 'cafe',
    });
    await db.deleteTransaction({ id: 'deleted' });
  });

  it('runs a value query, without deleted rows', async () => {
    expect(
      await run({
        table: 'transactions',
        filter: { 'payee.name': { $like: '%cafe%' } },
        calculate: { $sum: '$amount' },
      }),
    ).toBe(-1000);
  });

  it('runs a table query with groupBy and orderBy', async () => {
    expect(
      await run({
        table: 'transactions',
        groupBy: ['payee.name'],
        select: ['payee.name', { total: { $sum: '$amount' } }],
        // AQL cannot order by a select name, so it repeats the expression
        orderBy: [{ $sum: '$amount', $dir: 'asc' }],
      }),
    ).toEqual([
      { 'payee.name': 'Shop', total: -10000 },
      { 'payee.name': 'Corner Cafe', total: -1000 },
    ]);
  });

  it('joins a list of filters with and', async () => {
    expect(
      await run({
        table: 'transactions',
        filter: [{ payee: 'cafe' }, { date: { $gte: '2024-02-01' } }],
        calculate: { $count: '*' },
      }),
    ).toBe(1);
  });
});
