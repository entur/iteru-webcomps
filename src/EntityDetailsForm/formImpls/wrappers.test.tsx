/**
 * Contract tests for the generated wrappers — driven by `entities.manifest.json`,
 * so a new entity is covered the moment it is generated, with no test to write.
 *
 * These pin what the *generator* must keep emitting, not anything entity-specific:
 * the three load states (pending / settled-empty / failed) and the locked-field
 * display in create mode. Everything entity-shaped (component name, query root,
 * which field is locked, its label) is derived from the manifest and the distilled
 * `FIELDS` registry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { SobekProvider } from '../../context/SobekContext';
import { humanize } from '../../shared/humanize';
import type { FieldSpec } from '../types';
import { setPath } from '../utils/paths';
import * as forms from './index';
import * as entities from '../../entities';
import * as inputKeys from '../../generated/operations/inputKeys';
import { EditFooter } from '../components/EditFooter';
import { SectionToc } from '../../SectionToc';
import { useFormSession, type FormSession } from '../hooks/useFormSession';

// cwd-relative, matching how the generator itself reads the manifest.
const MANIFEST = 'entities.manifest.json';
const OWNER_REF = 'NOG:Authority:test';
const NETEX_ID = 'X:Thing:1';
// The one locked field the provider (and therefore the generated wrapper) seeds.
const OWNER_FIELD = 'dataOwnerRef';

interface ManifestEntry {
  entity: string;
  queryRoot: string;
  mutationName: string;
}

interface WrapperProps {
  netexId?: string;
  mode?: 'view' | 'edit';
  layout?: Record<string, string[]>;
  variant?: 'tabs' | 'stacked';
  session?: FormSession;
  onChange?: (value: unknown) => void;
}

const camel = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

// Kinds these tests know how to drive from the keyboard/mouse. Widening this
// union without adding the matching LOADED/EDITED entries is a compile error,
// which is the point: the suite is manifest-driven, so a kind it cannot drive
// has to fail loudly rather than type-check and then edit `undefined` into a
// control. Restricted to top-level paths so a loaded row is a flat literal.
type Drivable = Extract<FieldSpec['kind'], 'text' | 'number' | 'switch'>;
/** The drivable kinds driven by typing rather than clicking. */
type Typed = Exclude<Drivable, 'switch'>;

const DRIVABLE: Drivable[] = ['text', 'number', 'switch'];

/** Value to seed a loaded row with, per drivable kind. */
const LOADED: Record<Drivable, unknown> = { text: 'Loaded', number: 7, switch: false };
/** Value the edit moves it to — must differ from LOADED under `dirty.ts`. */
const EDITED: Record<Typed, string> = { text: 'Edited', number: '42' };

const isDrivableKind = (k: FieldSpec['kind']): k is Drivable =>
  (DRIVABLE as FieldSpec['kind'][]).includes(k);

/** Is this a field the tests can both seed and edit? */
const isDrivable = (f: FieldSpec): f is FieldSpec & { kind: Drivable } =>
  !f.serverManaged && !f.locked && f.path.length === 1 && isDrivableKind(f.kind);

/**
 * Type into (or toggle) one rendered control.
 *
 * @param kind  the field's control kind
 * @param label the control's visible label
 */
const editControl = (kind: Drivable, label: string): void => {
  const input = screen.getByLabelText(label);
  if (kind === 'switch') fireEvent.click(input);
  else fireEvent.change(input, { target: { value: EDITED[kind] } });
};

const manifest: ManifestEntry[] = JSON.parse(readFileSync(resolve(MANIFEST), 'utf8'));

const mockFns = vi.hoisted(() => ({
  request: vi.fn(),
  setHeaders: vi.fn(),
}));

vi.mock('graphql-request', () => ({
  __esModule: true,
  GraphQLClient: vi.fn().mockImplementation(function (this: any) {
    this.request = mockFns.request;
    this.setHeaders = mockFns.setHeaders;
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <SobekProvider value={{ endpoint: 'http://test', dataOwnerRef: OWNER_REF }}>
    {children}
  </SobekProvider>
);

/**
 * Render inside an **awaited** `act`.
 *
 * The form reads its record with `use()`, so the first render suspends, and a
 * render that suspends parks its retry on the act queue — the synchronous `act`
 * inside a bare `render` has already exited by then, leaving the tree on its
 * fallback forever. Awaiting the scope that contains the suspending render is
 * the supported pattern.
 */
const mount = async (ui: ReactElement): Promise<void> => {
  await act(async () => { render(ui, { wrapper }); });
};

/** Resolve one manifest entry to the generated component + its field registry. */
const bind = (entry: ManifestEntry) => {
  // Structural stand-in for the generated `<Entity>FormProps`, kept
  // entity-agnostic so this stays manifest-driven. The generated interface
  // itself is pinned by `scripts/generateWrappers.test.ts`.
  const comp = (forms as Record<string, ComponentType<WrapperProps>>)[
    `${entry.entity}Form`
  ];
  const fields = (entities as Record<string, Record<string, FieldSpec>>)[
    `${camel(entry.entity)}Fields`
  ];
  const mask = (inputKeys as Record<string, Record<string, unknown>>)[
    `${entry.entity}InputKeys`
  ];
  if (!comp) throw new Error(`no generated wrapper exported for ${entry.entity}`);
  if (!fields) throw new Error(`no distilled FIELDS for ${entry.entity}`);
  if (!mask) throw new Error(`no generated input keyset for ${entry.entity}`);
  return { Form: comp, fields, mask };
};

/**
 * What a host does now: one session, the TOC and the footer placed outside the
 * form. Save / Cancel exist only because this host renders them.
 */
const Hosted = ({ Form, ...props }: WrapperProps & { Form: ComponentType<WrapperProps> }) => {
  const session = useFormSession();
  return (
    <>
      <Form {...props} session={session} />
      <SectionToc {...session.toc} />
      <EditFooter {...session.footer} />
      <output aria-label="editable">{String(session.editable)}</output>
    </>
  );
};

describe.each(manifest.map(e => [e.entity, e] as const))(
  '%s wrapper contract',
  (_name, entry) => {
    const { Form, fields, mask } = bind(entry);
    const rows = (content: unknown[]) => ({ [entry.queryRoot]: { content } });

    beforeEach(() => {
      mockFns.request.mockReset();
      mockFns.setHeaders.mockReset();
    });

    it('renders a not-found state on a settled zero-row load (no blank form)', async () => {
      mockFns.request.mockResolvedValueOnce(rows([]));

      await mount(<Form netexId={NETEX_ID} />);

      await waitFor(() =>
        expect(screen.getByText(`Not found: ${NETEX_ID}`)).toBeInTheDocument()
      );
      // A blank editable form here would create a new entity on save.
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });

    it('never shows not-found on the first commit, before the load starts', () => {
      // Regression, from when a `loading` flag guarded this: it was false on the
      // first commit (the load started from a passive effect), so a not-found
      // branch gated on it rendered "Not found" for one frame on every mount of
      // an existing entity. Now the record is read with `use()` and the first
      // commit *is* the fallback, so this asserts a structural property.
      //
      // Deliberately not RTL's `render`: it wraps in `act()`, which flushes the
      // passive effect before returning and would hide such a flash entirely.
      // `flushSync` commits synchronously, so `container` holds exactly what the
      // browser would paint first.
      mockFns.request.mockReturnValueOnce(new Promise(() => {}));

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      try {
        flushSync(() => root.render(wrapper({ children: <Form netexId={NETEX_ID} /> })));
        expect(container.textContent).not.toContain('Not found');

        // The first paint is the shaped skeleton, and its shape is derived from
        // this entity's registry — no layout here, so one placeholder per field.
        const skel = container.querySelector('[role="status"][aria-busy="true"]');
        expect(skel).not.toBeNull();
        expect(skel!.querySelectorAll('[data-nmr-skeleton="field"]')).toHaveLength(
          Object.keys(fields).length
        );
      } finally {
        act(() => root.unmount());
        container.remove();
      }
    });

    it('surfaces a failed load instead of reporting it as not found', async () => {
      mockFns.request.mockRejectedValueOnce(new Error('boom'));

      await mount(<Form netexId={NETEX_ID} />);

      await waitFor(() => expect(screen.getByText('Failed to load')).toBeInTheDocument());
      expect(screen.queryByText(`Not found: ${NETEX_ID}`)).toBeNull();
    });

    // `FIELDS` is distilled from the patched schema, the mask from the live one,
    // so the difference is exactly the fields sobek would reject. They must reach
    // the control but never the request.
    const patchOnly = Object.keys(fields).filter(
      k => !fields[k].serverManaged && !fields[k].locked && !(fields[k].path[0] in mask)
    );

    // Fields these tests can seed and then edit — the footer is inert until the
    // form is dirty, so anything that clicks Save has to move a control first.
    const editable = Object.keys(fields).filter(k => isDrivable(fields[k]));
    // Written at the field's full path, so leaves hoisted out of one value
    // object (`validBetween.fromDate` / `.toDate`) land side by side in it.
    const seed = (keys: string[]): Record<string, unknown> =>
      keys.reduce<Record<string, unknown>>((row, k) => {
        const { kind, path } = fields[k];
        // Non-drivable kinds are only ever seeded, never edited, so any
        // non-empty value of the right shape will do for them.
        const v = isDrivableKind(kind) ? LOADED[kind] : kind === 'enumMulti' ? ['x'] : 'x';
        return setPath(row, path, v);
      }, {});

    /** Narrow a field the caller believes is drivable, or say so out loud. */
    const drivable = (key: string): FieldSpec & { kind: Drivable } => {
      const f = fields[key];
      if (!isDrivable(f)) throw new Error(`${entry.entity}.${key} is not drivable`);
      return f;
    };

    it.runIf(patchOnly.length && editable.length)('saves no patch-only field', async () => {
      const row = { netexId: NETEX_ID, ...seed(patchOnly) };
      mockFns.request
        .mockResolvedValueOnce(rows([row]))
        .mockResolvedValueOnce({ [entry.mutationName]: NETEX_ID })
        .mockResolvedValueOnce(rows([row]));

      await mount(<Hosted Form={Form} netexId={NETEX_ID} />);
      await waitFor(() => expect(screen.getByLabelText(humanize('netexId'))).toBeEnabled());

      // Edit a patch-only field where one is drivable: proves the field is
      // genuinely editable in the form and still stripped at the wire edge.
      const driver = patchOnly.find(k => isDrivable(fields[k])) ?? editable[0];
      editControl(drivable(driver).kind, humanize(driver));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(mockFns.request).toHaveBeenCalledTimes(3));
      const [, vars] = mockFns.request.mock.calls[1];
      const sent = Object.keys((vars as { input: Record<string, unknown> }).input);
      expect(sent).not.toHaveLength(0);
      expect(sent.filter(k => !(k in mask))).toEqual([]);
    });

    // Typing drivable fields only: a switch toggled twice is back at its loaded
    // value, which reads as clean, so it cannot show which edit was sent. And a
    // field that is actually sent: a patched one is stripped at the wire edge.
    const typedKey = editable.find(k => drivable(k).kind !== 'switch' && fields[k].path[0] in mask);

    it.runIf(typedKey !== undefined)('saves the latest edit through the host footer', async () => {
      const key = typedKey as string;
      const { kind, path } = drivable(key);
      const typed = kind as Typed;
      mockFns.request
        .mockResolvedValueOnce(rows([{ netexId: NETEX_ID, ...seed([key]) }]))
        .mockResolvedValueOnce({ [entry.mutationName]: NETEX_ID })
        .mockResolvedValueOnce(rows([{ netexId: NETEX_ID, ...seed([key]) }]));

      await mount(<Hosted Form={Form} netexId={NETEX_ID} />);
      await waitFor(() => expect(screen.getByLabelText(humanize(key))).toBeEnabled());

      // First edit to something that is not the final value, then the final one.
      const input = screen.getByLabelText(humanize(key));
      fireEvent.change(input, { target: { value: typed === 'number' ? '13' : 'Intermediate' } });
      fireEvent.change(input, { target: { value: EDITED[typed] } });

      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(mockFns.request).toHaveBeenCalledTimes(3));
      const { input: sent } = mockFns.request.mock.calls[1][1] as { input: Record<string, unknown> };
      expect(String(sent[path[0]])).toBe(EDITED[typed]);
    });

    it.runIf(typedKey !== undefined)('sends one mutation for a double Save in one tick', async () => {
      const key = typedKey as string;
      const typed = drivable(key).kind as Typed;
      mockFns.request
        .mockResolvedValueOnce(rows([{ netexId: NETEX_ID, ...seed([key]) }]))
        .mockResolvedValue({ [entry.mutationName]: NETEX_ID });

      await mount(<Hosted Form={Form} netexId={NETEX_ID} />);
      await waitFor(() => expect(screen.getByLabelText(humanize(key))).toBeEnabled());
      fireEvent.change(screen.getByLabelText(humanize(key)), { target: { value: EDITED[typed] } });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());

      // Native clicks inside one act: no commit between them, so the button is
      // still enabled for the second — as for a double-click or a doubled shortcut.
      const save = screen.getByRole('button', { name: 'Save' });
      await act(async () => {
        save.click();
        save.click();
      });

      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
      const mutations = mockFns.request.mock.calls.filter(
        ([, vars]) => (vars as { input?: unknown } | undefined)?.input !== undefined
      );
      expect(mutations).toHaveLength(1);
    });

    it.runIf(editable.length)(
      'keeps the footer inert until an edit, then wakes both actions',
      async () => {
        const key = editable[0];
        mockFns.request.mockResolvedValueOnce(rows([{ netexId: NETEX_ID, ...seed([key]) }]));

        await mount(<Hosted Form={Form} netexId={NETEX_ID} />);
        await waitFor(() => expect(screen.getByLabelText(humanize(key))).toBeEnabled());

        // Nothing to save and nothing to discard on a freshly loaded record.
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

        editControl(drivable(key).kind, humanize(key));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
      }
    );

    it.runIf(editable.length)('discards edits in place on Cancel, without refetching', async () => {
      const key = editable[0];
      const kind = drivable(key).kind;
      mockFns.request.mockResolvedValueOnce(rows([{ netexId: NETEX_ID, ...seed([key]) }]));

      await mount(<Hosted Form={Form} netexId={NETEX_ID} />);
      await waitFor(() => expect(screen.getByLabelText(humanize(key))).toBeEnabled());

      editControl(kind, humanize(key));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled());

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Restored from the hook's baseline — the host's alternative (remount
      // under a new `key`) would cost a second round trip for data we hold.
      const input = screen.getByLabelText(humanize(key)) as HTMLInputElement;
      if (kind === 'switch') expect(input.checked).toBe(LOADED.switch);
      else expect(input.value).toBe(String(LOADED[kind]));
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(mockFns.request).toHaveBeenCalledTimes(1);
    });

    it('renders no Save / Cancel of its own', async () => {
      mockFns.request.mockResolvedValueOnce(rows([{ netexId: NETEX_ID }]));

      await mount(<Form netexId={NETEX_ID} />);
      await waitFor(() => expect(screen.getByLabelText(humanize('netexId'))).toBeInTheDocument());

      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });

    it('leaves the host footer disabled in view mode', async () => {
      mockFns.request.mockResolvedValueOnce(rows([{ netexId: NETEX_ID }]));

      await mount(<Hosted Form={Form} netexId={NETEX_ID} mode="view" />);
      await waitFor(() => expect(screen.getByLabelText(humanize('netexId'))).toBeInTheDocument());

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByLabelText('editable')).toHaveTextContent('false');
    });

    it('reports the session editable for a loaded edit-mode record', async () => {
      mockFns.request.mockResolvedValueOnce(rows([{ netexId: NETEX_ID }]));

      await mount(<Hosted Form={Form} netexId={NETEX_ID} />);
      await waitFor(() => expect(screen.getByLabelText('editable')).toHaveTextContent('true'));
    });

    it('reports the session not editable after a failed load', async () => {
      mockFns.request.mockRejectedValueOnce(new Error('boom'));

      await mount(<Hosted Form={Form} netexId={NETEX_ID} />);
      await waitFor(() => expect(screen.getByText('Failed to load')).toBeInTheDocument());

      expect(screen.getByLabelText('editable')).toHaveTextContent('false');
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('leaves the host footer disabled when the record is not found', async () => {
      mockFns.request.mockResolvedValueOnce(rows([]));

      await mount(<Hosted Form={Form} netexId={NETEX_ID} />);
      await waitFor(() => expect(screen.getByText(`Not found: ${NETEX_ID}`)).toBeInTheDocument());

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByLabelText('editable')).toHaveTextContent('false');
    });

    // Any two registry keys make a two-section layout; labels are ours, so the
    // assertion needs no entity knowledge.
    const [first, second] = Object.keys(fields);
    const twoSections = { First: [first], Second: [second] };

    it('publishes a stacked layout’s sections to the host TOC', async () => {
      mockFns.request.mockResolvedValueOnce(rows([{ netexId: NETEX_ID }]));

      await mount(
        <Hosted Form={Form} netexId={NETEX_ID} layout={twoSections} variant="stacked" />
      );

      await waitFor(() =>
        expect(
          screen.getAllByRole('button').filter(b => b.closest('nav')).map(b => b.textContent)
        ).toEqual(['First', 'Second'])
      );
    });

    it('keeps the TOC through a load, as a skeleton of the same sections', async () => {
      mockFns.request.mockReturnValueOnce(new Promise(() => {}));

      await mount(
        <Hosted Form={Form} netexId={NETEX_ID} layout={twoSections} variant="stacked" />
      );

      // Still loading: the layout's sections hold the TOC's shape, unpickable.
      const nav = screen.getByRole('navigation', { name: 'Sections' });
      expect(nav).toHaveAttribute('aria-busy', 'true');
      expect([...nav.querySelectorAll('.MuiSkeleton-root')].map(b => b.textContent)).toEqual([
        'First',
        'Second',
      ]);
      expect(screen.getByLabelText('editable')).toHaveTextContent('false');
    });

    it('publishes no sections for a record that is not found', async () => {
      mockFns.request.mockResolvedValueOnce(rows([]));

      await mount(
        <Hosted Form={Form} netexId={NETEX_ID} layout={twoSections} variant="stacked" />
      );
      await waitFor(() => expect(screen.getByText(`Not found: ${NETEX_ID}`)).toBeInTheDocument());

      expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
    });

    it('publishes no sections for a tabbed form', async () => {
      mockFns.request.mockResolvedValueOnce(rows([{ netexId: NETEX_ID }]));

      await mount(<Hosted Form={Form} netexId={NETEX_ID} layout={twoSections} variant="tabs" />);
      await waitFor(() => expect(screen.getByRole('tab', { name: 'First' })).toBeInTheDocument());

      expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
    });

    it('forwards the loaded entity to the host via onChange', async () => {
      const row = { netexId: NETEX_ID };
      mockFns.request.mockResolvedValueOnce(rows([row]));
      const onChange = vi.fn();

      await mount(<Form netexId={NETEX_ID} onChange={onChange} />);

      // Pins the `...rest` passthrough into the hook. Note this passes even if
      // the generated props interface omits the callback — `rest` is untyped at
      // runtime, so the declaration is pinned separately, by the generator's
      // string test.
      await waitFor(() => expect(onChange).toHaveBeenCalledWith(row));
    });

    // Locked fields are client-supplied but not user-editable; the wrapper must
    // render them from context in create mode, disabled, without loading anything.
    const lockedKeys = Object.keys(fields).filter(k => fields[k].locked);

    it.runIf(lockedKeys.length)(
      'create mode renders locked fields from context, disabled, with no load',
      () => {
        render(<Form />, { wrapper });

        for (const key of lockedKeys) {
          const input = screen.getByLabelText(humanize(key)) as HTMLInputElement;
          expect(input).toBeDisabled();
          // Only the tenant discriminator is supplied by the provider today; any
          // other locked field would render empty until the generator seeds it.
          if (key === OWNER_FIELD) expect(input.value).toBe(OWNER_REF);
        }
        expect(mockFns.request).not.toHaveBeenCalled();
      }
    );
  }
);
