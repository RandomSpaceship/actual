import type { PointerEvent } from 'react';

import { useNavigate } from '#hooks/useNavigate';

import type { FormulaTableCellPosition } from './formulaChartData';
import {
  getCellsTransactionsFilter,
  toFilterConditions,
} from './formulaSourceMap';
import type { FormulaSourceMap, TransactionsFilter } from './formulaSourceMap';

// The items of the report graphs: bars, slices and the dot under the pointer
const graphItemSelector =
  '.recharts-bar-rectangle, .recharts-pie-sector, .recharts-active-dot';

// Opens the transactions of the table cells that a chart item or a table cell
// shows, as the custom report graphs do. Without a source map, nothing opens.
export function useFormulaTransactions(sourceMap: FormulaSourceMap | null) {
  const navigate = useNavigate();

  function getFilter(
    cells: FormulaTableCellPosition[] | undefined,
  ): TransactionsFilter | null {
    if (!sourceMap || !cells) return null;
    return getCellsTransactionsFilter(sourceMap, cells);
  }

  function openFilter(filter: TransactionsFilter | null) {
    if (!filter) return;
    void navigate('/accounts', {
      state: { goBack: true, filterConditions: toFilterConditions(filter) },
    });
  }

  return {
    isClickable: (cells: FormulaTableCellPosition[] | undefined) =>
      getFilter(cells) !== null,
    openCells: (cells: FormulaTableCellPosition[] | undefined) => {
      openFilter(getFilter(cells));
    },
    openFilter,
    // A dashboard card is a button that opens the card editor. A press on a
    // graph item opens its transactions, not the editor.
    onPointerDown: (event: PointerEvent) => {
      if (
        sourceMap &&
        event.target instanceof Element &&
        event.target.closest(graphItemSelector)
      ) {
        event.stopPropagation();
      }
    },
  };
}
