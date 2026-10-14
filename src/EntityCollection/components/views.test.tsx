import { beforeAll, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { DEFAULT_LABELS, defaultCollectionQuery } from '../types';
import { resolveCard, resolveColumns } from '../utils/columns';
import { keyRows } from '../utils/values';
import { CardsView } from './CardsView';
import { GridView } from './GridView';

// The grid is lazily imported. Load its module once up front, so the first
// grid test in this file doesn't spend its whole `findBy` wait importing it
// (borderline when every test file runs in parallel).
beforeAll(async () => {
  await import('@mui/x-data-grid');
});

const FIELDS: Record<string, FieldSpec> = {
  netexId: { kind: 'text', path: ['netexId'] },
  name: { kind: 'name', path: ['name'] },
  transportMode: { kind: 'enum', path: ['transportMode'] },
  propulsionTypes: { kind: 'enumMulti', path: ['propulsionTypes'] },
  lowFloor: { kind: 'switch', path: ['lowFloor'] },
};
const COLS = resolveColumns(FIELDS);
const ROWS = [
  { netexId: 'T:1', name: { value: 'Flirt' }, transportMode: 'rail', propulsionTypes: ['electric', 'diesel'], lowFloor: true },
  { netexId: 'T:2', name: null, transportMode: null, propulsionTypes: null, lowFloor: null },
];

/** Cards for `rows`, keyed as the collection keys them. */
const renderCards = (rows: unknown[]) =>
  render(<CardsView rows={keyRows(rows)} card={resolveCard(FIELDS, COLS)} labels={DEFAULT_LABELS} />);

/** A grid for `rows` (rendered inside an awaited act: the grid loads lazily). */
const renderGrid = async (
  rows: unknown[],
  over: { onQuery?: () => void; hidden?: Record<string, boolean>; total?: number; dataGrid?: Record<string, unknown> } = {}
) => {
  const onQuery = over.onQuery ?? vi.fn();
  await act(async () => {
    render(
      <GridView
        rows={keyRows(rows)}
        columns={COLS}
        total={over.total ?? rows.length}
        page={0}
        query={defaultCollectionQuery}
        onQuery={onQuery}
        density="standard"
        hidden={over.hidden ?? {}}
        labels={DEFAULT_LABELS}
        dataGrid={{ disableVirtualization: true, ...over.dataGrid }}
      />
    );
  });
  return onQuery;
};

describe('CardsView', () => {
  const mount = () => renderCards(ROWS);

  it('renders one list item per row with its title', () => {
    mount();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Flirt')).toBeTruthy();
  });

  it('labels every body field and formats each kind', () => {
    mount();
    const first = screen.getAllByRole('listitem')[0];
    expect(within(first).getByText('Transport mode')).toBeTruthy();
    expect(within(first).getByText('rail')).toBeTruthy();
    expect(within(first).getByText('electric')).toBeTruthy();
    expect(within(first).getByText('diesel')).toBeTruthy();
    expect(within(first).getByText('Yes')).toBeTruthy();
  });

  it('shows a dash for a missing title and missing values, without throwing', () => {
    mount();
    const second = screen.getAllByRole('listitem')[1];
    expect(within(second).getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });
});

const VERSIONS = [
  { netexId: 'T:1', version: '1', name: { value: 'First version' } },
  { netexId: 'T:2', version: '1', name: { value: 'Other' } },
  { netexId: 'T:1', version: '2', name: { value: 'Second version' } },
];

describe('compact id', () => {
  const ROWS_IDS = [{ netexId: 'VEH:VehicleType:1004', name: { value: 'Flirt' } }];

  it('heads the identity column "Id" and shows ::NUM, with the full id on hover', async () => {
    await renderGrid(ROWS_IDS);
    await screen.findByText('Flirt');
    expect(screen.getByRole('columnheader', { name: 'Id' })).toBeTruthy();
    expect(screen.getByText('::1004').closest('[title]')?.getAttribute('title')).toBe('VEH:VehicleType:1004');
    expect(screen.queryByText('VEH:VehicleType:1004')).toBeNull();
  });

  it('reads the id on a card as ::NUM/verNUM when the row has a version', () => {
    renderCards([{ netexId: 'VEH:VehicleType:1004', version: '3', name: { value: 'Flirt' } }]);
    expect(screen.getByText('::1004/ver3').closest('[title]')?.getAttribute('title')).toBe('VEH:VehicleType:1004');
  });

  it('leaves the version off the grid cell, which has its own Version column', async () => {
    await renderGrid([{ netexId: 'VEH:VehicleType:1004', version: '3', name: { value: 'Flirt' } }]);
    await screen.findByText('Flirt');
    expect(screen.getByText('::1004')).toBeTruthy();
    expect(screen.queryByText('::1004/ver3')).toBeNull();
  });

  it('shows ::NUM on a card, with the full id on hover', () => {
    renderCards(ROWS_IDS);
    expect(screen.getByText('::1004').closest('[title]')?.getAttribute('title')).toBe('VEH:VehicleType:1004');
  });
});

describe('owned grid props', () => {
  it('keeps its own page sizes and filtering off whatever the host passes', async () => {
    await renderGrid(ROWS, {
      total: 40,
      dataGrid: {
        pageSizeOptions: [500],
        disableColumnFilter: false,
        // A host filter model must not filter the page: the pipeline already did.
        filterModel: { items: [{ field: 'transportMode', operator: 'contains', value: 'no-such-mode' }] },
      },
    });
    await screen.findByText('Flirt');
    expect(screen.getAllByRole('row', { hidden: true })).toHaveLength(ROWS.length + 1);
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: /rows per page/i, hidden: true }));
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent)).toEqual(['10', '25', '50', '100']);
  });
});

describe('switch cells', () => {
  it('shows a missing switch as a dash in the grid, as cards do, and names yes/no', async () => {
    await renderGrid([
      { netexId: 'T:1', name: { value: 'On' }, lowFloor: true },
      { netexId: 'T:2', name: { value: 'Off' }, lowFloor: false },
      { netexId: 'T:3', name: { value: 'Unknown' }, lowFloor: null },
    ]);
    await screen.findByText('Unknown');
    const cell = (name: string) => within(screen.getByText(name).closest('[role=row]') as HTMLElement).getAllByRole('gridcell').at(-1)!;
    expect(within(cell('On')).getByTitle('Yes')).toBeTruthy();
    expect(within(cell('Off')).getByTitle('No')).toBeTruthy();
    expect(cell('Unknown').textContent).toBe('—');
  });
});

describe('versioned rows', () => {
  it('shows two versions of one entity as two grid rows, each with its own data', async () => {
    await renderGrid(VERSIONS);
    await screen.findByText('Other');
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('First version')).toBeTruthy();
    expect(screen.getByText('Second version')).toBeTruthy();
  });

  it('renders a repeated identity as two grid rows, each with its own data', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await renderGrid([
      { netexId: 'T:1', version: '1', name: { value: 'First copy' } },
      { netexId: 'T:1', version: '1', name: { value: 'Second copy' } },
    ]);
    await screen.findByText('First copy');
    expect(screen.getByText('Second copy')).toBeTruthy();
    warn.mockRestore();
  });

  it('renders two versions as two cards without a React key warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderCards(VERSIONS);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(error.mock.calls.map(c => String(c[0])).join('\n')).not.toMatch(/same key/);
    error.mockRestore();
  });
});

describe('GridView', () => {
  const mount = async () => {
    const onQuery = await renderGrid(ROWS, { total: 40, hidden: { lowFloor: false } });
    await screen.findByText('Flirt');
    return onQuery;
  };

  it('renders a header row plus one row per given row', async () => {
    await mount();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('heads columns with their labels and omits hidden ones', async () => {
    await mount();
    expect(screen.getByRole('columnheader', { name: 'Transport mode' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Low floor' })).toBeNull();
  });

  it('reports a header click as a sort patch instead of sorting itself', async () => {
    const onQuery = await mount();
    fireEvent.click(screen.getByRole('columnheader', { name: 'Name' }));
    expect(onQuery).toHaveBeenCalledWith({ sort: { field: 'name', dir: 'asc' } });
    expect(screen.getAllByRole('row')[1].textContent).toContain('Flirt');
  });
});
