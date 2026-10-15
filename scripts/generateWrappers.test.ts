import { describe, it, expect } from 'vitest';
import { renderWrapperSource, renderBarrel } from './generateWrappers';

const entry = {
  entity: 'Vehicle',
  queryRoot: 'vehicles',
  mutationName: 'createOrUpdateVehicle',
  ignore: [],
  relationFields: ['transportType'],
};

describe('renderWrapperSource', () => {
  const src = renderWrapperSource(entry);

  it('drops endpoint/headers/getHeaders from the props interface (provider-only)', () => {
    const propsBlock = src.slice(src.indexOf('export interface'), src.indexOf('}', src.indexOf('export interface')));
    expect(propsBlock).not.toMatch(/\bendpoint\b/);
    expect(propsBlock).not.toMatch(/\bheaders\?/);
    expect(propsBlock).not.toMatch(/\bgetHeaders\b/);
  });

  it('has no dataOwnerRef: \'\' literal; variables receives it from the hook', () => {
    expect(src).not.toMatch(/dataOwnerRef: ''/);
    expect(src).toMatch(
      /variables: \(netexId: string, dataOwnerRef: string\) => \(\{ filter: \{ netexIds: \[netexId\], dataOwnerRef \} \}\)/
    );
  });

  it('hands the generated wire-key mask to the mutation config', () => {
    expect(src).toMatch(/import \{ VehicleInputKeys \} from '\.\.\/\.\.\/generated\/operations\/inputKeys';/);
    expect(src).toMatch(/inputKeys: VehicleInputKeys,/);
  });

  it('declares the host observation callbacks on the props interface', () => {
    // Not passed to the presentation: they fall into `...rest` and reach
    // `useEntityForm`, which owns both the value and the baseline.
    expect(src).toMatch(/onChange\?: \(value: Vehicle \| undefined\) => void;/);
    expect(src).toMatch(/onDirtyChange\?: \(dirty: boolean\) => void;/);
  });

  it('renders the dirty-gated action footer in place of the bare Save button', () => {
    expect(src).toMatch(/import \{ EditFooter \} from '\.\.\/components\/EditFooter';/);
    expect(src).not.toMatch(/<button onClick=\{handleSave\}/);
    expect(src).toMatch(/dirty=\{dirty\}/);
    expect(src).toMatch(/onSave=\{handleSave\}/);
    // Cancel is the hook's in-place discard, not a remount — the wrapper owns
    // no `key` of its own and cannot re-mount itself.
    expect(src).toMatch(/onCancel=\{reset\}/);
    expect(src).toMatch(/const \{ value, setValue, reset, saving, load, dirty, errors, handleSave \}/);
    // No `loading`: the record is read with `use()`, so a pending load has not
    // committed at all — Suspense holds the fallback and the hook never returns.
    expect(src).not.toMatch(/[,{] loading\b|disabled=\{loading/);
  });

  it('exposes the footer to the host for labels and styling', () => {
    // The wrapper renders the footer itself, so without a passthrough a host
    // can neither localize it (English defaults, no i18n runtime here) nor theme
    // it. `EditFooterHostProps` omits the state the hook owns.
    expect(src).toMatch(/footerProps\?: EditFooterHostProps;/);
    // Spread before the controlled props: the type already forbids overriding
    // them, but the order makes it true at runtime too.
    expect(src).toMatch(/<EditFooter\s+\{\.\.\.footerProps\}\s+dirty=\{dirty\}/);
  });

  it('stands a shaped skeleton in for the record while it loads', () => {
    // Shape is derived, not hand-tuned: the same FIELDS + layout that draw the
    // form draw the placeholders, so a new entity needs no row-count literal.
    expect(src).toMatch(
      /import \{ FormSkeleton, FormArrival \} from '\.\.\/components\/FormSkeleton';/
    );
    expect(src).not.toMatch(/<div>Loading\.\.\.<\/div>/);
    // It is the Suspense fallback now, not an early return: the suspending half
    // has to sit inside the boundary, which is why the wrapper splits in two.
    expect(src).toMatch(/import \{ Suspense \} from 'react';/);
    expect(src).toMatch(
      /<Suspense\s+fallback=\{\s+<FormSkeleton\s+\{\.\.\.skeletonProps\}\s+fields=\{FIELDS\}\s+layout=\{rest\.layout\}\s+variant=\{rest\.variant\}\s+patched=\{rest\.patched\}\s+\/>\s+\}\s+>\s+<VehicleFormRecord \{\.\.\.rest\} resource=\{resource\} \/>\s+<\/Suspense>/
    );
  });

  it('exposes the skeleton to the host, and fades the arriving form in', () => {
    expect(src).toMatch(/skeletonProps\?: FormSkeletonHostProps;/);
    // Only the presentation is wrapped: an animated `transform` on an ancestor
    // becomes a containing block, which would break the footer's `position:
    // sticky` for the length of the fade.
    expect(src).toMatch(/<FormArrival>\s+<VehicleFormPresentation/);
    expect(src).toMatch(/<\/FormArrival>\s+\{\/\* Inert until/);
  });

  it('hands the patched display to the presentation, not to the hook', () => {
    // Left in `...rest` it would be spread into `useEntityForm` and never reach
    // the form that draws (or hides) the patched fields.
    expect(src).toMatch(/\n    slotProps,\n    patched,\n/);
    expect(src).toMatch(/slotProps=\{slotProps\}\s+patched=\{patched\}/);
  });

  it('hands the section-navigation pair to the presentation, not to the hook', () => {
    // Both are plain `EntityDetailsFormProps`, so they arrive in the wrapper's
    // props for free — but left in `...rest` they would be spread into
    // `useEntityForm` and never reach the form that scrolls.
    expect(src).toMatch(/\n    activeSection,\n    onActiveSectionChange,\n/);
    expect(src).toMatch(
      /activeSection=\{activeSection\}\s+onActiveSectionChange=\{onActiveSectionChange\}/
    );
  });

  it('gates not-found on the settled load phase, never on a loading flag', () => {
    // Both remaining branches are settled states. A pending record suspends, so
    // this component has not rendered — there is no first commit to flash on.
    expect(src).not.toMatch(/!loading && !value && netexId/);
    expect(src).toMatch(
      /if \(netexId && !value && load === 'ok'\) return <div>Not found: \{netexId\}<\/div>;/
    );
  });

  it('distinguishes a failed load from a missing record', () => {
    expect(src).toMatch(/if \(netexId && load === 'error'\) return <div>\{errors\.__init\}<\/div>;/);
  });

  it('overlays the display-only dataOwnerRef from context on every render', () => {
    expect(src).toMatch(/const \{ dataOwnerRef \} = useSobekCtx\(\);/);
    // Not `value ?? …`: that freezes the control at the org current when the
    // user first typed, while the save stamps whatever context holds now.
    expect(src).toMatch(/value=\{\{ \.\.\.\(value \?\? \(\{\} as Vehicle\)\), dataOwnerRef \}\}/);
    expect(src).toMatch(/import \{ useSobekCtx \} from '\.\.\/\.\.\/context\/SobekContext';/);
  });
});

describe('renderBarrel', () => {
  it('re-exports each wrapper component and its props type', () => {
    const out = renderBarrel([entry]);
    expect(out).toMatch(/export \{ VehicleForm \} from '\.\/vehicle';/);
    // Hosts otherwise reconstruct these with `ComponentProps<typeof VehicleForm>`.
    expect(out).toMatch(/export type \{ VehicleFormProps \} from '\.\/vehicle';/);
  });
});
