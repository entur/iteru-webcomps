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

  it('declares onChange on the props interface, and no onDirtyChange', () => {
    // onChange falls into `...rest` and reaches `useEntityForm`. Dirty now
    // reaches the host through the session.
    expect(src).toMatch(/onChange\?: \(value: Vehicle \| undefined\) => void;/);
    expect(src).not.toMatch(/onDirtyChange/);
  });

  it('renders no footer — its state goes to the host’s session instead', () => {
    expect(src).not.toMatch(/EditFooter/);
    expect(src).not.toMatch(/footerProps/);
    expect(src).toMatch(/session\?: FormSession;/);
    expect(src).toMatch(/import \{ useSessionConnection \} from '\.\.\/hooks\/useFormSession';/);
    expect(src).toMatch(/const \{ value, setValue, reset, saving, load, dirty, errors, handleSave \}/);
    // Save is the hook's handleSave, Cancel its in-place reset — not a remount.
    expect(src).toMatch(/save: handleSave,\s+cancel: reset,/);
    // Only a record that renders as a form is editable; view mode never is.
    expect(src).toMatch(/editable: shown && mode === 'edit',/);
    expect(src).not.toMatch(/[,{] loading\b|disabled=\{loading/);
  });

  it('publishes the TOC sections the form will render, and none for a record it will not', () => {
    expect(src).toMatch(/import \{ tocSections \} from '\.\.\/utils\/sections';/);
    expect(src).toMatch(/sections: shown \? tocSections\(FIELDS, layout, variant, patched\) : \[\],/);
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
      /<Suspense\s+fallback=\{\s+<FormSkeleton\s+\{\.\.\.skeletonProps\}\s+fields=\{FIELDS\}\s+layout=\{rest\.layout\}\s+variant=\{rest\.variant\}\s+patched=\{rest\.patched\}\s+widths=\{rest\.widths\}\s+\/>\s+\}\s+>\s+<VehicleFormRecord \{\.\.\.rest\} resource=\{resource\} \/>\s+<\/Suspense>/
    );
  });

  it('exposes the skeleton to the host, and fades the arriving form in', () => {
    expect(src).toMatch(/skeletonProps\?: FormSkeletonHostProps;/);
    // Only the presentation is wrapped: an animated `transform` on an ancestor
    // becomes a containing block, which would break the footer's `position:
    // sticky` for the length of the fade.
    expect(src).toMatch(/<FormArrival>\s+<VehicleFormPresentation/);
    expect(src).toMatch(/<\/FormArrival>\s+\);\n\}/);
  });

  it('hands the patched display and the widths to the presentation, not to the hook', () => {
    // Left in `...rest` they would be spread into `useEntityForm` and never
    // reach the form that draws (or hides) the fields.
    expect(src).toMatch(/\n    slotProps,\n    patched,\n    widths,\n/);
    expect(src).toMatch(/slotProps=\{slotProps\}\s+patched=\{patched\}\s+widths=\{widths\}/);
  });

  it('takes the section pair from the session, not from props', () => {
    // Omitted from the inherited form props, so a host can't pass them; the
    // connection hands them to the presentation. Left in `...rest` they would
    // be spread into `useEntityForm` and never reach the form that scrolls.
    expect(src).toMatch(/'disabled' \| 'activeSection' \| 'onActiveSectionChange'>/);
    expect(src).toMatch(/\n    session,\n/);
    expect(src).toMatch(/\{\.\.\.sectionNav\}/);
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
