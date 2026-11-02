import { useRef } from 'react';
import type { PointerEvent, MouseEvent as ReactMouseEvent } from 'react';

import { leaveChart } from '#components/reports/useChartTouch';

/**
 * Tells a chart's opening clicks from the taps that only select. A tap on
 * the selected item opens it; a tap on any other item only selects it, so its
 * tooltip can be read first. A mouse click opens at once.
 *
 * The selected item is marked with `data-chart-selected`, set to the key its
 * clicks pass to `isOpeningClick`.
 */
export function useChartPress() {
  // Most browsers move the selection with mouse events before the tap's
  // click arrives, so the selected item is noted when the finger goes down
  const pressRef = useRef<{ isTouch: boolean; selectedKey?: string }>(null);
  const hasOpenedRef = useRef(false);

  const onPointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    const selected = event.currentTarget.querySelector<SVGElement>(
      '[data-chart-selected]',
    );
    pressRef.current = {
      isTouch: event.pointerType !== 'mouse',
      selectedKey: selected?.dataset.chartSelected,
    };
  };

  // Without a selection to show there's nothing to select, so every tap
  // opens. `target` is the item clicked, when the click landed beside it.
  const isOpeningClick = (
    key: string,
    event: ReactMouseEvent<Element>,
    canSelect = true,
    target: Element = event.currentTarget,
  ) => {
    const press = pressRef.current;
    pressRef.current = null;
    // Only the first opening click of a double-click opens, so going back
    // takes one press
    if (event.detail <= 1) {
      hasOpenedRef.current = false;
    } else if (hasOpenedRef.current) {
      return false;
    }
    if (!press?.isTouch || !canSelect || press.selectedKey === key) {
      hasOpenedRef.current = true;
      return true;
    }
    // Some browsers send no mouse events after a tap (Firefox's touch
    // simulation), so hover the tapped point to select it
    const { clientX, clientY } = event;
    for (const type of ['mouseover', 'mousemove']) {
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, clientX, clientY }),
      );
    }
    return false;
  };

  // A tap too far from anything to select closes the tooltip, as a tap
  // outside the chart does. A mouse is still over the chart, so it's left.
  const onMissedClick = (event: ReactMouseEvent<Element>) => {
    const press = pressRef.current;
    pressRef.current = null;
    if (press?.isTouch) {
      // The mouse has to leave from inside the chart for it to see that, so
      // a tap beside the chart leaves from the chart itself
      const tapped =
        event.target instanceof Element ? event.target : event.currentTarget;
      const from = tapped.closest('.recharts-wrapper')
        ? tapped
        : event.currentTarget.querySelector('.recharts-wrapper');
      // Recharts moves its tooltip to the tap's mouse events in the next
      // frame, so this has to follow that
      requestAnimationFrame(() => from?.isConnected && leaveChart(from));
    }
  };

  return { onPointerDownCapture, isOpeningClick, onMissedClick };
}

// The key a cartesian chart's item is selected under: its column, and its
// series when the chart has several
export function getChartSelectionKey(index: number, series?: string) {
  return series ? `${index}:${series}` : String(index);
}
