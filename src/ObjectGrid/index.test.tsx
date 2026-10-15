import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ObjectGrid } from './index';

// The DataGrid renders rows under jsdom only with virtualization off; it is
// lazy-loaded, so every assertion waits for it.
const base = { label: 'Sections', dataGrid: { disableVirtualization: true } };
const LOAD = { timeout: 5000 };

describe('ObjectGrid', () => {
  it('shows a list of scalars as one comma-separated cell, in derived columns', async () => {
    render(<ObjectGrid {...base} rows={[{ id: 's1', length: 12, axles: [2.7, 8.6] }]} />);

    expect(await screen.findByRole('columnheader', { name: 'Axles' }, LOAD)).toBeInTheDocument();
    expect(screen.getByText('2.7, 8.6')).toBeInTheDocument();
  });

  it('shows it the same way in explicit columns', async () => {
    render(
      <ObjectGrid
        {...base}
        rows={[{ id: 's1', axles: [1.5, 6, 10.25] }]}
        cols={[{ field: 'axles', label: 'Axles (m)' }]}
      />
    );

    expect(await screen.findByRole('columnheader', { name: 'Axles (m)' }, LOAD)).toBeInTheDocument();
    expect(screen.getByText('1.5, 6, 10.25')).toBeInTheDocument();
  });

  it('still skips a column holding nested objects', async () => {
    render(<ObjectGrid {...base} rows={[{ id: 'a', name: 'x', nested: { deep: 1 } }]} />);

    expect(await screen.findByRole('columnheader', { name: 'Name' }, LOAD)).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Nested' })).toBeNull();
  });
});
