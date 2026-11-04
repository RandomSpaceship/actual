import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';

import { useNavigate } from '#hooks/useNavigate';

import type { FormulaTableCellPosition } from './formulaChartData';
import {
  getCellsTransactionsFilter,
  toFilterConditions,
} from './formulaSourceMap';
import type { FormulaSourceMap, TransactionsFilter } from './formulaSourceMap';

// Opens the transactions of the table cells that a chart item or a table cell
// shows, as the custom report graphs do. Without a source map, nothing opens.
export function useFormulaTransactions(sourceMap: FormulaSourceMap | null) {
  const navigate = useNavigate();
  const [isOverItem, setIsOverItem] = useState(false);
  const isOverItemRef = useRef(false);

  function getFilter(
    cells: FormulaTableCellPosition[] | undefined,
  ): TransactionsFilter | null {
    if (!sourceMap || !cells) return null;
    return getCellsTransactionsFilter(sourceMap, cells);
  }

  function openFilter(filter: TransactionsFilter | null) {
    if (!filter) return;
    isOverItemRef.current = false;
    setIsOverItem(false);
    void navigate('/accounts', {
      state: { goBack: true, filterConditions: toFilterConditions(filter) },
    });
  }

  return {
    // The pointer is over an item that opens transactions
    isOverItem,
    hoverCells: (cells: FormulaTableCellPosition[] | undefined) => {
      const isClickable = getFilter(cells) !== null;
      isOverItemRef.current = isClickable;
      setIsOverItem(isClickable);
    },
    openCells: (cells: FormulaTableCellPosition[] | undefined) => {
      openFilter(getFilter(cells));
    },
    openFilter,
    // A dashboard card is a button that opens the card editor. A press on an
    // item opens its transactions, not the editor.
    onPointerDown: (event: PointerEvent) => {
      if (isOverItemRef.current) event.stopPropagation();
    },
  };
}
