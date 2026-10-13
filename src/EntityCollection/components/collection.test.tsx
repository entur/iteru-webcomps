/**
 * Contract tests for `createEntityCollection` — driven by
 * `entities.manifest.json`, so a new entity is covered the moment it is
 * generated. Rows, labels and filterable fields are all derived from the
 * distilled registry and the generated filter map; no entity literals.
 */
import { describe, it, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { FC } from 'react';
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { humanize } from '../../shared/humanize';
import * as entities from '../../entities';
import * as filterFieldMaps from '../../generated/operations/filterFields';
import { defaultCollectionQuery, type EntityCollectionProps, type FilterFields } from '../types';
import { resolveColumns } from '../utils/columns';
import { createEntityCollection } from './collection';

const MANIFEST = 'entities.manifest.json';
const ROW_COUNT = 3;
const GRID_SLOT = { dataGrid: { disableVirtualization: true } };

interface ManifestEntry {
  entity: string;
}
const manifest: ManifestEntry[] = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const camel = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** Rows built from the registry: every top-level text / name field gets a
 *  value unique to its row, so any of them can serve as a search needle. */
const makeRows = (fields: Record<string, FieldSpec>, n: number): Record<string, unknown>[] =>
  Array.from({ length: n }, (_, i) =>
    Object.fromEntries(
      Object.entries(fields).flatMap(([key, spec]): [string, unknown][] =>
        spec.path.length !== 1
          ? []
          : spec.kind === 'text'
            ? [[key, `${key}-${i}`]]
            : spec.kind === 'name'
              ? [[key, { value: `${key}-${i}` }]]
              : []
      )
    )
  );

describe.each(manifest)('$entity collection', ({ entity }) => {
  const fields = (entities as Record<string, unknown>)[`${camel(entity)}Fields`] as Record<string, FieldSpec> | undefined;
  const filterFields = (filterFieldMaps as Record<string, unknown>)[`${entity}FilterFields`] as FilterFields | undefined;
  if (!fields) throw new Error(`No registry export for manifest entity ${entity}`);
  if (!filterFields) throw new Error(`No generated ${entity}FilterFields for manifest entity ${entity}`);

  const Collection = createEntityCollection<Record<string, unknown>>(fields, { filterFields }) as FC<
    EntityCollectionProps<Record<string, unknown>>
  >;
  const rows = makeRows(fields, ROW_COUNT);
  const cols = resolveColumns(fields);
  const textCol = cols.find(c => c.spec.kind === 'text' && c.spec.path.length === 1);
  if (!textCol) throw new Error(`${entity} has no top-level text column to drive the tests with`);
  const needle = `${textCol.key}-1`;

  const mount = async (props: Partial<EntityCollectionProps<Record<string, unknown>>> = {}) => {
    await act(async () => {
      render(<Collection rows={rows} slotProps={GRID_SLOT} {...props} />);
    });
  };
  const gridRows = async (): Promise<number> => (await screen.findAllByRole('row')).length - 1; // minus header

  it('never offers a patched or grid field', () => {
    const banned = Object.entries(fields).filter(([, s]) => s.patched || s.kind === 'grid').map(([k]) => k);
    expect(cols.map(c => c.key).filter(k => banned.includes(k))).toEqual([]);
  });

  it('shows every row as a card', async () => {
    await mount({ view: 'cards' });
    expect(screen.getAllByRole('listitem')).toHaveLength(ROW_COUNT);
  });

  it('shows the same rows in the grid', async () => {
    await mount({ view: 'grid' });
    expect(await gridRows()).toBe(ROW_COUNT);
  });

  it('applies one controlled query identically to both views', async () => {
    const query = { ...defaultCollectionQuery, search: needle };
    await mount({ view: 'cards', query });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    cleanup();
    await mount({ view: 'grid', query });
    expect(await gridRows()).toBe(1);
  });

  it('narrows the cards as the user types, and emits the query', async () => {
    const onQueryChange = vi.fn();
    await mount({ view: 'cards', onQueryChange });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: needle } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(onQueryChange).toHaveBeenLastCalledWith({ ...defaultCollectionQuery, search: needle });
  });

  it('returns to the first page when the query narrows', async () => {
    const onQueryChange = vi.fn();
    await mount({ view: 'cards', onQueryChange, query: { ...defaultCollectionQuery, pageSize: 1, page: 2 } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: needle } });
    expect(onQueryChange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, search: needle }));
  });

  it('shows the last valid page when a controlled page is out of range', async () => {
    await mount({ view: 'cards', query: { ...defaultCollectionQuery, pageSize: 2, page: 9 } });
    expect(screen.getAllByRole('listitem')).toHaveLength(ROW_COUNT - 2);
  });

  it('keeps the toolbar and says so when nothing matches', async () => {
    await mount({ view: 'cards', query: { ...defaultCollectionQuery, search: 'no-such-row' } });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('No rows')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeTruthy();
  });

  it('renders the grid overlay, not a crash, for no rows at all', async () => {
    await mount({ view: 'grid', rows: [] });
    expect(await screen.findByText('No rows')).toBeTruthy();
  });

  it('enables exactly the generated filter fields in the popover', async () => {
    await mount({ view: 'cards' });
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const pop = screen.getByRole('dialog');
    const open = cols.filter(c => filterFields[c.key]);
    const blocked = cols.filter(c => !filterFields[c.key]);
    expect(open.length).toBeGreaterThan(0);
    open.forEach(c => expect(within(pop).getAllByLabelText(c.label).length).toBeGreaterThan(0));
    blocked.forEach(c =>
      expect(
        within(pop).getAllByText(c.label).some(el => el.closest('li')?.getAttribute('aria-disabled') === 'true')
      ).toBe(true)
    );
  });

  it('applies a filter in client mode and only emits it in server mode', async () => {
    const filterable = cols.find(c => filterFields[c.key]?.op === 'contains' && c.spec.path.length === 1);
    if (!filterable) return; // entity has no top-level contains filter to drive
    const filters = { [filterable.key]: `${filterable.key}-1` };
    await mount({ view: 'cards', query: { ...defaultCollectionQuery, filters } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    cleanup();
    await mount({ view: 'cards', filterMode: 'server', query: { ...defaultCollectionQuery, filters } });
    expect(screen.getAllByRole('listitem')).toHaveLength(ROW_COUNT);
  });

  it('trims the toolbar to the tools asked for', async () => {
    await mount({ view: 'grid', tools: ['search'] });
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Density' })).toBeNull();
  });

  it('hides every tool but keeps host actions when tools is false', async () => {
    await mount({ view: 'grid', tools: false, actions: <button>Host action</button> });
    expect(screen.queryByRole('textbox', { name: 'Search' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Host action' })).toBeTruthy();
  });

  it('labels a column with a host override', async () => {
    await mount({ view: 'grid', columns: [{ field: textCol.key, label: 'Custom label' }] });
    expect(await screen.findByRole('columnheader', { name: 'Custom label' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: humanize(textCol.key) })).toBeNull();
  });
});
