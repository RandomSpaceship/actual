import type { FormatType } from '#hooks/useFormat';

// A bar, a point or a slice of a graph
export type GraphItem = {
  // The index of the item in the data of the graph
  index: number;
  // The legend entry of the series, for a graph with series
  dataKey?: string;
  // A two-ring donut: the inner ring is 'group'
  ring?: 'group' | 'item';
};

// The props that let a graph open something other than the transactions of a
// custom report. With onItemClick, a click on an item calls it in place of
// showActivity, and only a clickable item shows the pointer cursor.
export type GraphItemClickProps = {
  onItemClick?: (item: GraphItem) => void;
  isItemClickable?: (item: GraphItem) => boolean;
};

// Shows a value of the graph. The graphs use useFormat when there is none.
export type GraphFormat = (value: unknown, type?: FormatType) => string;
