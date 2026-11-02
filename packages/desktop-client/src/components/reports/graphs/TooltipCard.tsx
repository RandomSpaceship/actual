import React from 'react';
import type { ReactNode } from 'react';

import { theme } from '@actual-app/components/theme';
import { css } from '@emotion/css';

const openHintClassName = css({
  marginTop: 8,
  fontSize: 12,
  color: theme.menuItemTextHeader,
  // A mouse click opens an item at once, so only touch screens need it
  '@media (hover: hover)': { display: 'none' },
});

type TooltipCardProps = {
  title: ReactNode;
  children: ReactNode;
  // How to open what the tooltip shows, for touch screens
  openHint?: ReactNode;
};

/**
 * The card report graph tooltips are drawn in, with a title above.
 */
export function TooltipCard({ title, children, openHint }: TooltipCardProps) {
  return (
    <div
      className={css({
        zIndex: 1000,
        pointerEvents: 'none',
        borderRadius: 2,
        boxShadow: '0 1px 6px rgba(0, 0, 0, .20)',
        backgroundColor: theme.menuBackground,
        color: theme.menuItemText,
        padding: 10,
      })}
    >
      <div style={{ marginBottom: 10 }}>
        <strong>{title}</strong>
      </div>
      <div style={{ lineHeight: 1.5 }}>{children}</div>
      {openHint && <div className={openHintClassName}>{openHint}</div>}
    </div>
  );
}
