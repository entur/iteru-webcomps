/**
 * The MUI X `DataGrid`, deferred until a grid actually renders (often in an
 * unselected tab, or never, in a cards-only view). `@mui/x-data-grid` is an
 * externalized peer dep, so this dynamic import stays in the output for the
 * host bundler to code-split into its own chunk — pages without a grid never
 * pay for it. Shared by `ObjectGrid` and the collection's `GridView`.
 */
import { lazy, Suspense } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import type { DataGridProps } from '@mui/x-data-grid';

const SPINNER_PX = 18;

const DataGrid = lazy(() => import('@mui/x-data-grid').then(m => ({ default: m.DataGrid })));

export interface LazyDataGridProps extends DataGridProps {
  /** Height of the placeholder shown while the grid's chunk loads. */
  fallbackHeight: number;
  /** Optional text beside the placeholder's spinner. */
  fallbackLabel?: string;
}

/**
 * Render a `DataGrid` behind its own `<Suspense>`, with a spinner placeholder
 * of the grid's expected height while the chunk loads.
 *
 * @param fallbackHeight placeholder height (px)
 * @param fallbackLabel  optional text beside the spinner
 * @returns the grid, or its placeholder
 */
export function LazyDataGrid({ fallbackHeight, fallbackLabel, ...grid }: LazyDataGridProps): React.ReactNode {
  return (
    <Suspense
      fallback={
        <Box
          sx={{ height: fallbackHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}
        >
          <CircularProgress size={SPINNER_PX} />
          {fallbackLabel ? (
            <Typography variant="body2" color="text.secondary">
              {fallbackLabel}
            </Typography>
          ) : null}
        </Box>
      }
    >
      <DataGrid {...grid} />
    </Suspense>
  );
}
