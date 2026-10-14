import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { FieldSpec } from '../../EntityDetailsForm/types';
import { DEFAULT_LABELS, defaultCollectionQuery, type CollectionQuery } from '../types';
import { resolveColumns } from '../utils/columns';
import { QueryField } from './QueryField';

const FIELDS: Record<string, FieldSpec> = {
  netexId: { kind: 'text', path: ['netexId'] },
  name: { kind: 'name', path: ['name'] },
  transportMode: { kind: 'enum', path: ['transportMode'], options: ['bus', 'rail', 'tram'] },
  length: { kind: 'number', path: ['length'] },
};
const COLS = resolveColumns(FIELDS);
const FF = {
  netexId: { arg: 'netexIds', op: 'anyOf' },
  name: { arg: 'name', op: 'contains' },
  transportMode: { arg: 'transportModes', op: 'anyOf' },
} as const;

const mount = (over: { search?: boolean; filter?: boolean; query?: Partial<CollectionQuery> } = {}) => {
  const onQuery = vi.fn();
  render(
    <QueryField
      search={over.search ?? true}
      filter={over.filter ?? true}
      columns={COLS}
      filterFields={FF}
      query={{ ...defaultCollectionQuery, ...over.query }}
      onQuery={onQuery}
      labels={DEFAULT_LABELS}
    />
  );
  return onQuery;
};

const field = (): HTMLElement => screen.getByRole('textbox', { name: 'Search' }).closest('.MuiInputBase-root') as HTMLElement;

describe('QueryField', () => {
  it('says what the search covers in its placeholder, with no caption beneath', () => {
    mount();
    expect(screen.getByRole('textbox', { name: 'Search' }).getAttribute('placeholder')).toBe('Search these rows');
    expect(document.querySelector('.MuiFormHelperText-root')).toBeNull();
  });

  it('reports typing as a search patch', () => {
    const onQuery = mount();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'fli' } });
    expect(onQuery).toHaveBeenCalledWith({ search: 'fli' });
  });

  it('carries active filters inside the search field, ahead of the text', () => {
    mount({ query: { filters: { name: 'fli' } } });
    const tokens = within(field()).getByRole('group', { name: 'Active filters' });
    expect(within(tokens).getByText('Name: fli')).toBeTruthy();
    expect(tokens.compareDocumentPosition(screen.getByRole('textbox', { name: 'Search' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the filter button inside the field and counts active filters on it', () => {
    mount({ query: { filters: { name: 'fli', transportMode: ['rail'] } } });
    const button = within(field()).getByRole('button', { name: 'Filters' });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(within(button.parentElement as HTMLElement).getByText('2')).toBeTruthy();
  });

  it('opens the filter panel from the button', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeTruthy();
    // The open popover hides its siblings from the accessibility tree.
    expect(screen.getByRole('button', { name: 'Filters', hidden: true }).getAttribute('aria-expanded')).toBe('true');
  });

  it('shows at most two filters and folds the rest into a +N chip that opens the panel', () => {
    mount({ query: { filters: { netexId: ['T:1'], name: 'fli', transportMode: ['rail'] } } });
    const tokens = screen.getByRole('group', { name: 'Active filters' });
    expect(within(tokens).getByText('Netex id: T:1')).toBeTruthy();
    expect(within(tokens).getByText('Name: fli')).toBeTruthy();
    expect(within(tokens).queryByText(/Transport mode/)).toBeNull();
    fireEvent.click(within(tokens).getByRole('button', { name: '1 more filter' }));
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeTruthy();
  });

  it('shortens a long filter value and keeps the full text on hover', () => {
    mount({ query: { filters: { transportMode: ['bus', 'rail', 'tram'] } } });
    const chip = screen.getByText(/^Transport mode: /).closest('.MuiChip-root') as HTMLElement;
    expect(chip.textContent).toBe('Transport mode: bus, rail, tr…');
    expect(chip.getAttribute('title')).toBe('Transport mode: bus, rail, tram');
  });

  it('removes a filter from its chip', () => {
    const onQuery = mount({ query: { filters: { name: 'fli', transportMode: ['rail'] } } });
    const chip = screen.getByText('Name: fli').closest('.MuiChip-root') as HTMLElement;
    fireEvent.click(chip.querySelector('.MuiChip-deleteIcon') as Element);
    expect(onQuery).toHaveBeenCalledWith({ filters: { transportMode: ['rail'] } });
  });

  it('removes the last filter on Backspace in an empty field, and only then', () => {
    const onQuery = mount({ query: { filters: { name: 'fli', transportMode: ['rail'] } } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search' }), { key: 'Backspace' });
    expect(onQuery).toHaveBeenCalledWith({ filters: { name: 'fli' } });
  });

  it('leaves the filters alone on Backspace while text remains', () => {
    const onQuery = mount({ query: { search: 'x', filters: { name: 'fli' } } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search' }), { key: 'Backspace' });
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('commits a typed id when the id field loses focus, not only on Enter', () => {
    const onQuery = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const ids = within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('combobox', { name: 'Netex id' });
    fireEvent.change(ids, { target: { value: 'T:1' } });
    fireEvent.blur(ids);
    expect(onQuery).toHaveBeenCalledWith({ filters: { netexId: ['T:1'] } });
  });

  it('trims a typed id before it becomes a filter', () => {
    const onQuery = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const ids = within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('combobox', { name: 'Netex id' });
    fireEvent.change(ids, { target: { value: '  T:1 ' } });
    fireEvent.keyDown(ids, { key: 'Enter' });
    expect(onQuery).toHaveBeenCalledWith({ filters: { netexId: ['T:1'] } });
  });

  it('shows no chip for an empty condition', () => {
    mount({ query: { filters: { name: '  ', transportMode: [] } } });
    expect(screen.queryByRole('group', { name: 'Active filters' })).toBeNull();
  });

  it('is a plain search field when filtering is trimmed away', () => {
    mount({ filter: false, query: { filters: { name: 'fli' } } });
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Active filters' })).toBeNull();
  });

  it('keeps the filter button and its chips on one row when search is trimmed away', () => {
    mount({ search: false, query: { filters: { name: 'fli' } } });
    expect(screen.queryByRole('textbox', { name: 'Search' })).toBeNull();
    const button = screen.getByRole('button', { name: 'Filters' });
    const tokens = screen.getByRole('group', { name: 'Active filters' });
    expect(button.closest('[data-query-field]')).toBe(tokens.closest('[data-query-field]'));
    expect(button.closest('[data-query-field]')).not.toBeNull();
  });

  it('renders nothing with both tools trimmed', () => {
    const { container } = render(
      <QueryField search={false} filter={false} columns={COLS} filterFields={FF} query={defaultCollectionQuery} onQuery={vi.fn()} labels={DEFAULT_LABELS} />
    );
    expect(container.innerHTML).toBe('');
  });
});
