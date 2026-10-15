import { useState } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createAbstractEntityDetailsForm } from './abstractForm';
import type { FieldSpec, EntityDetailsFormProps } from '../types';

interface V {
  name?: { value?: string | null } | null;
  length?: number | null;
  version?: number | null;
  dataOwnerRef?: string | null;
}

const fields: Record<string, FieldSpec> = {
  name: { kind: 'name', path: ['name'] },
  length: { kind: 'number', path: ['length'] },
  version: { kind: 'number', path: ['version'], serverManaged: true },
  dataOwnerRef: { kind: 'text', path: ['dataOwnerRef'], locked: true },
};

const Form = createAbstractEntityDetailsForm<V>(fields);

const Host = (props: Partial<EntityDetailsFormProps<V>>) => {
  const [v, setV] = useState<V>({
    name: { value: 'Tram' },
    length: 5,
    version: 1,
    dataOwnerRef: 'NOG:Authority:test',
  });
  return <Form value={v} onChange={setV} mode="edit" {...props} />;
};

describe('createAbstractEntityDetailsForm', () => {
  it('renders all fields flat when no layout is given', () => {
    render(<Host />);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Tram');
    expect((screen.getByLabelText('Length') as HTMLInputElement).value).toBe('5');
  });

  it('round-trips a name edit through onChange', () => {
    render(<Host />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bus' } });
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Bus');
  });

  it('locks serverManaged fields even in edit mode', () => {
    render(<Host />);
    expect(screen.getByLabelText('Version')).toBeDisabled();
  });

  it('locks locked fields even in edit mode', () => {
    render(<Host />);
    const input = screen.getByLabelText('Data owner ref') as HTMLInputElement;
    expect(input).toBeDisabled();
    expect(input.value).toBe('NOG:Authority:test');
  });

  it('disables every field in view mode', () => {
    render(<Host mode="view" />);
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByLabelText('Length')).toBeDisabled();
  });

  it('whitelists: a field absent from the layout is not rendered', () => {
    render(<Host layout={{ Edit: ['name'] }} />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Length')).toBeNull();
  });

  it('honors a label override', () => {
    render(<Host layout={{ Edit: [{ field: 'length', label: 'Length (m)' }] }} />);
    expect(screen.getByLabelText('Length (m)')).toBeInTheDocument();
  });

  it('renders a tab bar only with ≥2 sections', () => {
    render(<Host layout={{ A: ['name'], B: ['length'] }} />);
    expect(screen.getByRole('tab', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'B' })).toBeInTheDocument();
  });

  it('stacks sections with no tab bar when variant="stacked"', () => {
    render(<Host layout={{ A: ['name'], B: ['length'] }} variant="stacked" />);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Length')).toBeInTheDocument();
  });

  it('drops a section whose keys are all unknown (no empty tab)', () => {
    render(<Host layout={{ Real: ['name'], Ghost: ['nope'] }} />);
    expect(screen.queryByRole('tab')).toBeNull(); // only one non-empty section → flat
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('applies a per-kind TextField slotProps override and keeps the shrink default', () => {
    // `name` is a `name` kind (TextField). The override sets a slot prop but
    // omits `inputLabel`, so the lib's label-shrink default must survive.
    const { container } = render(<Host slotProps={{ name: { htmlInput: { maxLength: 80 } } }} />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('maxlength', '80');
    expect(container.querySelector('label')).toHaveClass('MuiInputLabel-shrink');
  });

  it('spreads per-kind switch slotProps onto the Switch', () => {
    const SwForm = createAbstractEntityDetailsForm<{ active?: boolean }>({
      active: { kind: 'switch', path: ['active'] },
    });
    const { container } = render(
      <SwForm
        value={{ active: true }}
        onChange={() => {}}
        mode="edit"
        slotProps={{ switch: { color: 'secondary' } }}
      />
    );
    expect(container.querySelector('.MuiSwitch-colorSecondary')).not.toBeNull();
  });

  it('renders a date kind as a native date input', () => {
    const DForm = createAbstractEntityDetailsForm<{ built?: string | null }>({
      built: { kind: 'date', path: ['built'] },
    });
    render(<DForm value={{ built: '2020-01-15' }} onChange={() => {}} mode="edit" />);
    const input = screen.getByLabelText('Built') as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.value).toBe('2020-01-15');
  });

  interface R {
    transportType?: { netexId?: string | null } | null;
  }
  const refFields: Record<string, FieldSpec> = {
    transportType: { kind: 'reference', path: ['transportType', 'netexId'] },
  };
  const RefForm = createAbstractEntityDetailsForm<R>(refFields);

  it('reference with options renders an Autocomplete showing the matched label', () => {
    const layout = {
      Edit: [
        {
          field: 'transportType',
          label: 'VehicleType',
          options: () => [
            { value: 'VT:1', label: 'Class 70 EMU' },
            { value: 'VT:2', label: 'Class 80 DMU' },
          ],
        },
      ],
    };
    render(
      <RefForm
        value={{ transportType: { netexId: 'VT:2' } }}
        onChange={() => {}}
        mode="edit"
        layout={layout}
      />
    );
    // The combobox shows the label of the option whose value matches the id leaf.
    expect((screen.getByLabelText('VehicleType') as HTMLInputElement).value).toBe('Class 80 DMU');
  });

  it('reference without options degrades to a free-text id field', () => {
    // No layout → no `options` closure; the field edits the raw netexId leaf.
    render(<RefForm value={{ transportType: { netexId: 'VT:9' } }} onChange={() => {}} mode="edit" />);
    const input = screen.getByLabelText('Transport type') as HTMLInputElement;
    expect(input.value).toBe('VT:9');
    expect(input).not.toHaveAttribute('role', 'combobox');
  });

  it('reference Autocomplete writes the selected value into the id leaf', () => {
    const Host2 = () => {
      const [v, setV] = useState<R>({ transportType: { netexId: 'VT:1' } });
      return (
        <RefForm
          value={v}
          onChange={setV}
          mode="edit"
          layout={{
            Edit: [
              {
                field: 'transportType',
                options: () => [
                  { value: 'VT:1', label: 'Alpha' },
                  { value: 'VT:2', label: 'Beta' },
                ],
              },
            ],
          }}
        />
      );
    };
    render(<Host2 />);
    const input = screen.getByLabelText('Transport type') as HTMLInputElement;
    fireEvent.mouseDown(input); // open the listbox
    fireEvent.click(screen.getByText('Beta'));
    expect(input.value).toBe('Beta');
  });

  it('surfaces errors and disables inputs when disabled is true', () => {
    const { container } = render(
      <Form
        value={{ name: { value: 'Tram' }, length: 5 }}
        onChange={() => {}}
        mode="edit"
        errors={{ name: 'Already exists' }}
        disabled
      />
    );
    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    expect(nameInput).toBeDisabled();
    expect(container.querySelector('.Mui-error')).not.toBeNull();
    expect(screen.getByText(/Already exists/)).toBeInTheDocument();
  });
});

describe('stacked sections ↔ host navigation', () => {
  // jsdom has neither API, so both are stood in: the observer records what it
  // was asked to watch and lets the test decide what is "in view".
  let observers: { cb: IntersectionObserverCallback; nodes: Element[] }[];
  let scrolled: (string | undefined)[];

  beforeEach(() => {
    observers = [];
    scrolled = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        nodes: Element[] = [];
        constructor(public cb: IntersectionObserverCallback) {
          observers.push(this);
        }
        observe(n: Element) {
          this.nodes.push(n);
        }
        disconnect() {}
      }
    );
    Element.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.dataset.section);
    };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  const layout = { A: ['name'], B: ['length'], C: ['version'] };
  const section = (label: string) => document.querySelector(`[data-section="${label}"]`)!;
  /** Tell the observer which sections are (not) crossing the reading band. */
  const see = (state: Record<string, boolean>) =>
    act(() => {
      const o = observers.at(-1)!;
      o.cb(
        Object.entries(state).map(
          ([label, isIntersecting]) =>
            ({ target: section(label), isIntersecting }) as unknown as IntersectionObserverEntry
        ),
        o as unknown as IntersectionObserver
      );
    });

  it('watches every stacked section', () => {
    render(<Host layout={layout} variant="stacked" />);
    expect(observers.at(-1)!.nodes).toEqual(['A', 'B', 'C'].map(section));
  });

  it('reports the first section in view, in document order', () => {
    const onActiveSectionChange = vi.fn();
    render(<Host layout={layout} variant="stacked" onActiveSectionChange={onActiveSectionChange} />);
    see({ C: true, B: true });
    expect(onActiveSectionChange).toHaveBeenLastCalledWith('B');
    see({ B: false });
    expect(onActiveSectionChange).toHaveBeenLastCalledWith('C');
    expect(onActiveSectionChange).toHaveBeenCalledTimes(2);
  });

  it('scrolls to a section when activeSection changes, but not at mount', () => {
    const { rerender } = render(<Host layout={layout} variant="stacked" activeSection="B" />);
    expect(scrolled).toEqual([]);
    rerender(<Host layout={layout} variant="stacked" activeSection="C" />);
    expect(scrolled).toEqual(['C']);
  });

  it('does not scroll to a section it reported itself', () => {
    // The pair is meant to be wired to one piece of host state, so the form's
    // own report comes straight back in as `activeSection`.
    const Wired = () => {
      const [s, setS] = useState<string>();
      return <Host layout={layout} variant="stacked" activeSection={s} onActiveSectionChange={setS} />;
    };
    render(<Wired />);
    see({ B: true });
    expect(scrolled).toEqual([]);
  });

  it('stays silent while a requested scroll passes other sections', () => {
    const onActiveSectionChange = vi.fn();
    const props = { layout, variant: 'stacked' as const, onActiveSectionChange };
    const { rerender } = render(<Host {...props} />);
    rerender(<Host {...props} activeSection="C" />);
    see({ A: true, B: true }); // passed on the way down
    expect(onActiveSectionChange).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new Event('scrollend'));
    });
    see({ A: false }); // the reader scrolls on their own again
    expect(onActiveSectionChange).toHaveBeenLastCalledWith('B');
  });

  it('keeps a section whose name contains a newline whole', () => {
    // A layout key is any string; a delimiter-joined key would split this one
    // into two labels and observe neither.
    const odd = 'Overview\n(details)';
    const onActiveSectionChange = vi.fn();
    render(
      <Host
        layout={{ [odd]: ['name'], B: ['length'] }}
        variant="stacked"
        onActiveSectionChange={onActiveSectionChange}
      />
    );
    const node = [...document.querySelectorAll<HTMLElement>('[data-section]')].find(
      n => n.dataset.section === odd
    )!;
    expect(observers.at(-1)!.nodes).toContain(node);
    act(() => {
      const o = observers.at(-1)!;
      o.cb(
        [{ target: node, isIntersecting: true } as unknown as IntersectionObserverEntry],
        o as unknown as IntersectionObserver
      );
    });
    expect(onActiveSectionChange).toHaveBeenLastCalledWith(odd);
  });

  it('reports the last section at the end of the scroll, though it never reaches the band', () => {
    const root = document.documentElement;
    const at = (scrollTop: number) =>
      act(() => {
        Object.defineProperties(root, {
          scrollTop: { value: scrollTop, configurable: true },
          clientHeight: { value: 800, configurable: true },
          scrollHeight: { value: 2000, configurable: true },
        });
        window.dispatchEvent(new Event('scroll'));
      });
    const onActiveSectionChange = vi.fn();
    render(<Host layout={layout} variant="stacked" onActiveSectionChange={onActiveSectionChange} />);
    try {
      see({ B: true }); // C is short: on screen, but below the band for good
      at(1200);
      expect(onActiveSectionChange).toHaveBeenLastCalledWith('C');
      at(1100); // back off the end → the band decides again
      expect(onActiveSectionChange).toHaveBeenLastCalledWith('B');
    } finally {
      ['scrollTop', 'clientHeight', 'scrollHeight'].forEach(
        k => delete (root as unknown as Record<string, unknown>)[k]
      );
    }
  });

  it('leaves tabbed and flat forms alone', () => {
    const { rerender } = render(<Host layout={layout} activeSection="A" />);
    rerender(<Host layout={layout} activeSection="C" />);
    rerender(<Host activeSection="A" />);
    // MUI's own `Tabs` observes its scroll buttons, so "no observer" is too
    // strong — what must hold is that none of them is watching a section.
    const watched = observers.flatMap(o => o.nodes).filter(n => n.hasAttribute('data-section'));
    expect(watched).toEqual([]);
    expect(scrolled).toEqual([]);
  });
});

describe('patched fields', () => {
  const PForm = createAbstractEntityDetailsForm<V>({
    ...fields,
    length: { ...fields.length, patched: true },
  });
  const mount = (props: Partial<EntityDetailsFormProps<V>> = {}) =>
    render(<PForm value={{}} onChange={() => {}} mode="edit" {...props} />);
  /** The row a labelled control sits in: control cell + mark cell. */
  const rowOf = (label: string) => screen.getByLabelText(label).closest('.MuiFormControl-root')!
    .parentElement!.parentElement!;

  it('puts a * after a patched control, outside the input, and nowhere else', () => {
    mount();
    const marks = [...document.querySelectorAll('[data-patch-mark]')];
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('*');
    expect(marks[0]).toHaveAccessibleName(/not saved/i);
    const row = rowOf('Length');
    expect(row).toContainElement(marks[0] as HTMLElement);
    // After the control's cell, not inside it.
    expect(row.lastElementChild).toContainElement(marks[0] as HTMLElement);
    expect(row.firstElementChild).not.toContainElement(marks[0] as HTMLElement);
  });

  it('narrows only the marked row — an unmarked control keeps the full width', () => {
    mount();
    expect(rowOf('Length').children).toHaveLength(2);
    expect(rowOf('Name').children).toHaveLength(1);
  });

  it('adds no column when no rendered field is patched', () => {
    mount({ layout: { Edit: ['name'] } });
    expect(rowOf('Name').children).toHaveLength(1);
    render(<Host />);
    expect(document.querySelector('[data-patch-mark]')).toBeNull();
  });

  it("patched='plain' renders the field without the * or its column", () => {
    mount({ patched: 'plain' });
    expect(screen.getByLabelText('Length')).toBeInTheDocument();
    expect(document.querySelector('[data-patch-mark]')).toBeNull();
    expect(rowOf('Name').children).toHaveLength(1);
    expect(rowOf('Length').children).toHaveLength(1);
  });

  it("patched='hide' leaves the field out but keeps its value on edit", () => {
    const onChange = vi.fn();
    render(
      <PForm
        value={{ name: { value: 'Tram' }, length: 7 }}
        onChange={onChange}
        mode="edit"
        patched="hide"
      />
    );
    expect(screen.queryByLabelText('Length')).toBeNull();
    expect(rowOf('Name').children).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bus' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ length: 7 }));
  });
});
