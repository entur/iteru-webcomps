import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { ALL_TOOLS, DEFAULT_LABELS, defaultCollectionQuery, type CollectionQuery, type CollectionTool, type CollectionView } from '../types';
import { resolveColumns } from '../utils/columns';
import { CollectionToolbar } from './CollectionToolbar';

const FIELDS: Record<string, FieldSpec> = {
  netexId: { kind: 'text', path: ['netexId'] },
  name: { kind: 'name', path: ['name'] },
  transportMode: { kind: 'enum', path: ['transportMode'], options: ['bus', 'rail'] },
  length: { kind: 'number', path: ['length'] },
};
const COLS = resolveColumns(FIELDS);
const FF = {
  name: { arg: 'name', op: 'contains' },
  transportMode: { arg: 'transportModes', op: 'anyOf' },
} as const;

const mount = (over: { tools?: readonly CollectionTool[]; view?: CollectionView; query?: Partial<CollectionQuery> } = {}) => {
  const onQuery = vi.fn(), onDensity = vi.fn(), onHidden = vi.fn();
  render(
    <CollectionToolbar
      tools={over.tools ?? ALL_TOOLS}
      view={over.view ?? 'grid'}
      columns={COLS}
      filterFields={FF}
      query={{ ...defaultCollectionQuery, ...over.query }}
      onQuery={onQuery}
      density="standard"
      onDensity={onDensity}
      hidden={{}}
      onHidden={onHidden}
      labels={DEFAULT_LABELS}
      actions={<button>Host action</button>}
    />
  );
  return { onQuery, onDensity, onHidden };
};

describe('CollectionToolbar', () => {
  it('captions the search box and reports typing', () => {
    const { onQuery } = mount();
    expect(screen.getByText('(from cached filter)')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'fli' } });
    expect(onQuery).toHaveBeenCalledWith({ search: 'fli' });
  });

  it('renders only the whitelisted tools, and always the host actions', () => {
    mount({ tools: ['search'] });
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Host action' })).toBeTruthy();
  });

  it('drops the grid-only tools in cards view', () => {
    mount({ view: 'cards' });
    expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Density' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
  });

  it('offers a control for each sobek-filterable field and lists the rest disabled', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const pop = screen.getByRole('dialog');
    expect((within(pop).getByRole('textbox', { name: 'Name' }) as HTMLInputElement).disabled).toBe(false);
    expect(within(pop).getByRole('combobox', { name: 'Transport mode' })).toBeTruthy();
    expect(within(pop).getByText('Not filterable in sobek yet')).toBeTruthy();
    const blocked = within(pop).getByText('Length').closest('li');
    expect(blocked?.getAttribute('aria-disabled')).toBe('true');
    expect(within(pop).queryByRole('textbox', { name: 'Length' })).toBeNull();
  });

  it('reports a filter edit as a whole filters patch', () => {
    const { onQuery } = mount({ query: { filters: { transportMode: ['rail'] } } });
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'fli' },
    });
    expect(onQuery).toHaveBeenCalledWith({ filters: { transportMode: ['rail'], name: 'fli' } });
  });

  it('shows active filters as chips and removes one on delete', () => {
    const { onQuery } = mount({ query: { filters: { transportMode: ['rail'], name: 'fli' } } });
    const chip = screen.getByText('Name: fli').closest('.MuiChip-root') as HTMLElement;
    fireEvent.click(chip.querySelector('.MuiChip-deleteIcon') as Element);
    expect(onQuery).toHaveBeenCalledWith({ filters: { transportMode: ['rail'] } });
  });

  it('shows no chip for an empty condition', () => {
    mount({ query: { filters: { name: '  ', transportMode: [] } } });
    expect(document.querySelector('.MuiChip-root')).toBeNull();
  });

  it('toggles the sort direction of the active sort', () => {
    const { onQuery } = mount({ query: { sort: { field: 'name', dir: 'asc' } } });
    fireEvent.click(screen.getByRole('button', { name: 'Sort direction' }));
    expect(onQuery).toHaveBeenCalledWith({ sort: { field: 'name', dir: 'desc' } });
  });

  it('hides a column from the columns menu', () => {
    const { onHidden } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Length' }));
    expect(onHidden).toHaveBeenCalledWith({ length: false });
  });

  it('sets a density from the density menu', () => {
    const { onDensity } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Density' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'compact' }));
    expect(onDensity).toHaveBeenCalledWith('compact');
  });
});
