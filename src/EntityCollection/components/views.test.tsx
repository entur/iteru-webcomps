import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { DEFAULT_LABELS, defaultCollectionQuery } from '../types';
import { resolveCard, resolveColumns } from '../utils/columns';
import { CardsView } from './CardsView';
import { GridView } from './GridView';

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

describe('CardsView', () => {
  const mount = () =>
    render(<CardsView rows={ROWS} card={resolveCard(FIELDS, COLS)} labels={DEFAULT_LABELS} />);

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

describe('GridView', () => {
  const mount = async (onQuery = vi.fn()) => {
    await act(async () => {
      render(
        <GridView
          rows={ROWS}
          columns={COLS}
          total={40}
          page={0}
          query={defaultCollectionQuery}
          onQuery={onQuery}
          density="standard"
          hidden={{ lowFloor: false }}
          labels={DEFAULT_LABELS}
          dataGrid={{ disableVirtualization: true }}
        />
      );
    });
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
