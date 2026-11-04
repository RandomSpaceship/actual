import {
  ArraySize,
  CellError,
  EmptyValue,
  ErrorType,
  FunctionArgumentType,
  FunctionPlugin,
  SimpleRangeValue,
} from 'hyperformula';
import type { InterpreterState } from 'hyperformula/typings/interpreter/InterpreterState';
import type { Ast, ProcedureAst } from 'hyperformula/typings/parser';

type Cell = SimpleRangeValue['data'][number][number];

// The Excel functions CHOOSECOLS, CHOOSEROWS, TAKE, DROP and FILTER, which
// pick rows and columns of a table. FILTER replaces the HyperFormula
// function, which takes only one row or one column.
export class TableFunctionsPlugin extends FunctionPlugin {
  choosecols(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('CHOOSECOLS'),
      (table: SimpleRangeValue, ...indexes: number[]) => {
        const columns = indexes.map(index => toPosition(index, table.width()));
        if (columns.some(column => column === undefined)) {
          return indexError(table.width(), 'columns');
        }
        return SimpleRangeValue.onlyValues(
          table.data.map(row => columns.map(column => row[column ?? 0])),
        );
      },
    );
  }

  choosecolsSize(ast: ProcedureAst, state: InterpreterState) {
    const table = this.arraySizeForAst(ast.args[0], state);
    return new ArraySize(ast.args.length - 1, table.height);
  }

  chooserows(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('CHOOSEROWS'),
      (table: SimpleRangeValue, ...indexes: number[]) => {
        const rows = indexes.map(index => toPosition(index, table.height()));
        if (rows.some(row => row === undefined)) {
          return indexError(table.height(), 'rows');
        }
        return SimpleRangeValue.onlyValues(
          rows.map(row => [...table.data[row ?? 0]]),
        );
      },
    );
  }

  chooserowsSize(ast: ProcedureAst, state: InterpreterState) {
    const table = this.arraySizeForAst(ast.args[0], state);
    return new ArraySize(table.width, ast.args.length - 1);
  }

  take(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('TAKE'),
      (table: SimpleRangeValue, rows?: number, columns?: number) =>
        sliceTable(
          table,
          isOmitted(ast.args[1]) ? undefined : rows,
          isOmitted(ast.args[2]) ? undefined : columns,
          takeRange,
        ),
    );
  }

  takeSize(ast: ProcedureAst, state: InterpreterState) {
    const table = this.arraySizeForAst(ast.args[0], state);
    const [rows, columns] = [ast.args[1], ast.args[2]].map(getLiteralNumber);
    return new ArraySize(
      columns === undefined
        ? table.width
        : Math.min(Math.abs(columns), table.width),
      rows === undefined
        ? table.height
        : Math.min(Math.abs(rows), table.height),
    );
  }

  drop(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('DROP'),
      (table: SimpleRangeValue, rows?: number, columns?: number) =>
        sliceTable(
          table,
          isOmitted(ast.args[1]) ? undefined : rows,
          isOmitted(ast.args[2]) ? undefined : columns,
          dropRange,
        ),
    );
  }

  dropSize(ast: ProcedureAst, state: InterpreterState) {
    const table = this.arraySizeForAst(ast.args[0], state);
    const [rows, columns] = [ast.args[1], ast.args[2]].map(getLiteralNumber);
    const width =
      columns === undefined ? table.width : table.width - Math.abs(columns);
    const height =
      rows === undefined ? table.height : table.height - Math.abs(rows);
    if (width < 1 || height < 1) return ArraySize.error();
    return new ArraySize(width, height);
  }

  filter(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata('FILTER'),
      (table: SimpleRangeValue, include: SimpleRangeValue, ifEmpty?: Cell) => {
        const byRows =
          include.width() === 1 && include.height() === table.height();
        const byColumns =
          include.height() === 1 && include.width() === table.width();
        if (!byRows && !byColumns) {
          return new CellError(
            ErrorType.VALUE,
            'The include argument must be one column with a row for each table row, or one row with a column for each table column',
          );
        }
        const flags = include.data.flat().map(isIncluded);
        const flagError = flags.find(flag => flag instanceof CellError);
        if (flagError instanceof CellError) return flagError;

        // A one-column table with a one-column include filters its rows
        const result = byRows
          ? table.data.filter((_row, rowIndex) => flags[rowIndex] === true)
          : table.data.map(row =>
              row.filter((_cell, columnIndex) => flags[columnIndex] === true),
            );
        if (result.length === 0 || result[0].length === 0) {
          return ifEmpty ?? new CellError(ErrorType.NA, 'No rows match');
        }
        return SimpleRangeValue.onlyValues(result);
      },
    );
  }

  // At most the size of the table, because the rows that match are not known
  // before the function runs
  filterSize(ast: ProcedureAst, state: InterpreterState) {
    // A new size, because the size of a range marks the result as a
    // reference, and HyperFormula then reads it as one value
    const table = this.arraySizeForAst(ast.args[0], state);
    return new ArraySize(table.width, table.height);
  }
}

TableFunctionsPlugin.implementedFunctions = {
  CHOOSECOLS: {
    method: 'choosecols',
    sizeOfResultArrayMethod: 'choosecolsSize',
    parameters: [
      { argumentType: FunctionArgumentType.RANGE },
      { argumentType: FunctionArgumentType.INTEGER },
    ],
    repeatLastArgs: 1,
  },
  CHOOSEROWS: {
    method: 'chooserows',
    sizeOfResultArrayMethod: 'chooserowsSize',
    parameters: [
      { argumentType: FunctionArgumentType.RANGE },
      { argumentType: FunctionArgumentType.INTEGER },
    ],
    repeatLastArgs: 1,
  },
  TAKE: {
    method: 'take',
    sizeOfResultArrayMethod: 'takeSize',
    parameters: [
      { argumentType: FunctionArgumentType.RANGE },
      { argumentType: FunctionArgumentType.INTEGER, optionalArg: true },
      { argumentType: FunctionArgumentType.INTEGER, optionalArg: true },
    ],
  },
  DROP: {
    method: 'drop',
    sizeOfResultArrayMethod: 'dropSize',
    parameters: [
      { argumentType: FunctionArgumentType.RANGE },
      { argumentType: FunctionArgumentType.INTEGER, optionalArg: true },
      { argumentType: FunctionArgumentType.INTEGER, optionalArg: true },
    ],
  },
  FILTER: {
    method: 'filter',
    sizeOfResultArrayMethod: 'filterSize',
    enableArrayArithmeticForArguments: true,
    parameters: [
      { argumentType: FunctionArgumentType.RANGE },
      { argumentType: FunctionArgumentType.RANGE },
      { argumentType: FunctionArgumentType.SCALAR, optionalArg: true },
    ],
  },
};

export const tableFunctionsTranslations = {
  enUS: {
    CHOOSECOLS: 'CHOOSECOLS',
    CHOOSEROWS: 'CHOOSEROWS',
    TAKE: 'TAKE',
    DROP: 'DROP',
    FILTER: 'FILTER',
  },
};

// The 0-based position of a 1-based index. A negative index counts from the
// end. undefined: 0, or past the end.
function toPosition(index: number, length: number) {
  const position = index < 0 ? length + index : index - 1;
  return index === 0 || position < 0 || position >= length
    ? undefined
    : position;
}

function indexError(length: number, kind: 'rows' | 'columns') {
  return new CellError(
    ErrorType.VALUE,
    `Use an index from 1 to ${length}, or from -1 to -${length}, because the table has ${length} ${kind}`,
  );
}

type RangeOfCount = (
  length: number,
  count: number,
) => { start: number; end: number };

// TAKE: a positive count takes from the start, and a negative count from the
// end. A count past the size takes all.
function takeRange(length: number, count: number) {
  const size = Math.min(Math.abs(count), length);
  return count < 0
    ? { start: length - size, end: length }
    : { start: 0, end: size };
}

// DROP: a positive count drops from the start, and a negative count from the
// end
function dropRange(length: number, count: number) {
  const size = Math.min(Math.abs(count), length);
  return count < 0
    ? { start: 0, end: length - size }
    : { start: size, end: length };
}

// An omitted count keeps all the rows or columns
function sliceTable(
  table: SimpleRangeValue,
  rows: number | undefined,
  columns: number | undefined,
  rangeOfCount: RangeOfCount,
) {
  if (rows === 0 || columns === 0) {
    return new CellError(ErrorType.VALUE, 'The count cannot be 0');
  }
  const rowRange =
    rows === undefined
      ? { start: 0, end: table.height() }
      : rangeOfCount(table.height(), rows);
  const columnRange =
    columns === undefined
      ? { start: 0, end: table.width() }
      : rangeOfCount(table.width(), columns);
  if (rowRange.end <= rowRange.start || columnRange.end <= columnRange.start) {
    return new CellError(ErrorType.VALUE, 'No rows or columns are left');
  }
  return SimpleRangeValue.onlyValues(
    table.data
      .slice(rowRange.start, rowRange.end)
      .map(row => row.slice(columnRange.start, columnRange.end)),
  );
}

// HyperFormula gives 0 for an empty argument, as in TAKE(table, , 2)
function isOmitted(ast: Ast | undefined) {
  return ast === undefined || ast.type === 'EMPTY';
}

// A number in the formula, such as 3 or -2. undefined: the argument is
// missing, or it is not a number in the formula.
function getLiteralNumber(ast: Ast | undefined): number | undefined {
  if (!ast) return undefined;
  if (ast.type === 'NUMBER') return ast.value;
  if (ast.type === 'MINUS_UNARY_OP' && ast.value.type === 'NUMBER') {
    return -ast.value.value;
  }
  return undefined;
}

// As in Excel: TRUE or a number that is not 0 includes, and FALSE, 0 or an
// empty cell does not. Text gives an error.
function isIncluded(value: Cell): boolean | CellError {
  if (value instanceof CellError) return value;
  if (value === EmptyValue) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return new CellError(
      ErrorType.VALUE,
      'The include argument must be TRUE, FALSE or numbers',
    );
  }
  return value.val !== 0;
}
