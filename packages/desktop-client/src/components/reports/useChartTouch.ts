import { useEffect, useRef } from 'react';
import type { PointerEvent, RefObject, TouchEvent } from 'react';

import { css } from '@emotion/css';

// How far a finger can move and still tap the tooltip
const TAP_SLOP = 10;
// How far a finger moves before its drag is taken as a scrub or a scroll
const DIRECTION_SLOP = 6;
// Only a drag this much steeper than it is wide scrolls the page, which is
// within about 27° of vertical. Anything flatter scrubs.
const SCROLL_STEEPNESS = 2;
// How long after a touch ends its click can still arrive. react-aria clicks
// for itself after 80ms when the browser sends none.
const LATE_CLICK_MS = 500;

const chartTouchClassName = css({
  // Lets the page scroll vertically until a drag is found to be a scrub
  touchAction: 'pan-y pinch-zoom',
  // A touch's events all go to the element it started on, so a drag that
  // starts on one Recharts redraws for each column would stop there
  '& .recharts-tooltip-cursor, & .recharts-active-dot': {
    pointerEvents: 'none',
  },
});

type Touch = {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  isOnTooltip: boolean;
  // Whether anything around the chart can scroll, so a drag could
  canScroll: boolean;
  // Without one, a drag has nothing to show, so it's left to the browser
  hasTooltip: boolean;
  drag: 'undecided' | 'scrub' | 'scroll' | 'free';
};

/**
 * Touch handling for a chart, which Recharts leaves to mouse events. Recharts
 * keeps a tooltip open after a tap, and scrubs on every touch move, even while
 * the page scrolls.
 *
 * - A near-vertical drag scrolls the page, if anything around the chart
 *   can scroll; any other drag scrubs, and doesn't press what the chart is
 *   in (such as a dashboard card)
 * - With `canDismiss`, a tap outside the chart or on its tooltip closes the
 *   tooltip, and so does a scroll that starts on the chart. A tap on one of
 *   the tooltip's rows can do something else instead.
 */
type UseChartTouchProps = {
  canDismiss: boolean;
  // A tap on a tooltip row marked with `data-tooltip-row` calls this
  // instead of closing the tooltip
  onTooltipRowTap?: (row: HTMLElement) => void;
};

export function useChartTouch({
  canDismiss,
  onTooltipRowTap,
}: UseChartTouchProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  // Gets the mouseout that closes the tooltip, so its own leave handlers run
  const hoveredRef = useRef<Element | null>(null);
  const touchRef = useRef<Touch | null>(null);

  useEffect(() => {
    if (!canDismiss) {
      return;
    }
    // A tap outside still does what it would, so it's not stopped here
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const container = nodeRef.current;
      if (
        container &&
        event.pointerType !== 'mouse' &&
        event.target instanceof Node &&
        !container.contains(event.target)
      ) {
        closeTooltip(container, hoveredRef);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true);
  }, [canDismiss]);

  const startScroll = (touch: Touch) => {
    touch.drag = 'scroll';
    touch.isOnTooltip = false;
    if (canDismiss && nodeRef.current) {
      closeTooltip(nodeRef.current, hoveredRef);
    }
  };

  // React listens to touch moves passively, and a scrub has to stop the page
  // scrolling, so this listener is added directly. It captures, because
  // React also listens on the Recharts wrapper, below this element.
  const ref = (node: HTMLDivElement | null) => {
    nodeRef.current = node;
    if (!node) {
      return;
    }
    const onTouchMove = (event: globalThis.TouchEvent) => {
      const touch = touchRef.current;
      const point = event.touches[0];
      // Pinch-zoom is left to the browser
      if (!touch || !point || event.touches.length > 1) {
        return;
      }
      const dx = Math.abs(point.clientX - touch.startX);
      const dy = Math.abs(point.clientY - touch.startY);
      if (Math.hypot(dx, dy) > TAP_SLOP) {
        touch.isOnTooltip = false;
      }
      if (touch.drag === 'undecided' && Math.hypot(dx, dy) > DIRECTION_SLOP) {
        if (touch.hasTooltip && touch.canScroll && dy > dx * SCROLL_STEEPNESS) {
          startScroll(touch);
        } else {
          touch.drag = touch.hasTooltip ? 'scrub' : 'free';
          // Pressables such as a dashboard card press on release, even after
          // a drag, unless the pointer is cancelled
          node.dispatchEvent(
            new PointerEvent('pointercancel', {
              bubbles: true,
              pointerId: touch.pointerId,
              pointerType: touch.pointerType,
            }),
          );
        }
      }
      if (touch.drag === 'scroll') {
        // Keeps it from Recharts, which would move the tooltip
        event.stopPropagation();
      } else if (touch.drag === 'scrub' && event.cancelable) {
        event.preventDefault();
      }
    };
    node.addEventListener('touchmove', onTouchMove, {
      capture: true,
      passive: false,
    });
    return () =>
      node.removeEventListener('touchmove', onTouchMove, { capture: true });
  };

  return {
    ref,
    className: chartTouchClassName,
    onMouseOverCapture: (event: { target: EventTarget }) => {
      if (event.target instanceof Element) {
        hoveredRef.current = event.target;
      }
    },
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse') {
        touchRef.current = null;
        return;
      }
      touchRef.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        // The tooltip lets pointer events through, so the tap lands on the
        // chart under it
        isOnTooltip:
          canDismiss &&
          isOverTooltip(event.currentTarget, event.clientX, event.clientY),
        canScroll: canScrollVertically(event.currentTarget),
        hasTooltip: !!event.currentTarget.querySelector(
          '.recharts-tooltip-wrapper',
        ),
        drag: 'undecided',
      };
    },
    // The browser took the touch over, to scroll before the drag was decided.
    // The cancel sent once a drag is decided is let through.
    onPointerCancelCapture: () => {
      const touch = touchRef.current;
      if (touch?.drag === 'undecided') {
        startScroll(touch);
      }
    },
    onTouchEndCapture: (event: TouchEvent<HTMLDivElement>) => {
      const touch = touchRef.current;
      touchRef.current = null;
      if (!touch) {
        return;
      }
      // Neither a drag nor a tap on the tooltip should press what's under
      // the finger, or what the chart is in (such as a dashboard card)
      if (touch.drag !== 'undecided' || touch.isOnTooltip) {
        swallowNextClick();
      }
      const node = nodeRef.current;
      if (touch.isOnTooltip && node) {
        // Stops the tap's mouse events too, which would select whatever is
        // under the tooltip
        event.preventDefault();
        const point = event.changedTouches[0];
        const row = point && findTooltipRow(node, point.clientY);
        if (row && onTooltipRowTap) {
          onTooltipRowTap(row);
        } else {
          closeTooltip(node, hoveredRef);
        }
      }
    },
  };
}

function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(
    () => window.removeEventListener('click', swallow, { capture: true }),
    LATE_CLICK_MS,
  );
}

function canScrollVertically(element: Element) {
  for (
    let ancestor = element.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const { overflowY } = getComputedStyle(ancestor);
    if (
      ancestor.scrollHeight > ancestor.clientHeight &&
      (overflowY === 'auto' ||
        overflowY === 'scroll' ||
        ancestor === document.scrollingElement)
    ) {
      return true;
    }
  }
  return false;
}

// The tooltip row level with a point on the page. The tooltip lets pointer
// events through, so its rows are found by where they are.
function findTooltipRow(container: Element, y: number) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-tooltip-row]'),
  ).find(row => {
    const rect = row.getBoundingClientRect();
    return y >= rect.top && y <= rect.bottom;
  });
}

function isOverTooltip(container: Element, x: number, y: number) {
  return Array.from(
    container.querySelectorAll('.recharts-tooltip-wrapper'),
  ).some(tooltip => {
    if (getComputedStyle(tooltip).visibility === 'hidden') {
      return false;
    }
    const rect = tooltip.getBoundingClientRect();
    return (
      rect.width > 0 &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  });
}

// Recharts clears its tooltip when the mouse leaves the chart, so act that
// out
function closeTooltip(
  container: Element,
  hoveredRef: RefObject<Element | null>,
) {
  const hovered = hoveredRef.current;
  hoveredRef.current = null;
  const from = hovered?.isConnected && container.contains(hovered) && hovered;
  if (from) {
    leaveChart(from);
  }
  for (const wrapper of container.querySelectorAll('.recharts-wrapper')) {
    if (!from || !wrapper.contains(from)) {
      leaveChart(wrapper);
    }
  }
}

/**
 * Closes the tooltip of the chart `element` is in, as the mouse leaving it
 * would. The leave handlers of `element` and everything above it run.
 */
export function leaveChart(element: Element) {
  // React reads a mouseout towards nothing as leaving every element above
  // its target
  element.dispatchEvent(
    new MouseEvent('mouseout', { bubbles: true, relatedTarget: null }),
  );
}
