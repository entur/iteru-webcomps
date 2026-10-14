/**
 * Public API of `@entur/mui-comps-nmr`.
 *
 * The generic form factory + data-aware form implementations, plus the
 * generated per-entity types and field registries. Consumers never import
 * from `generated/` directly.
 */
export { createAbstractEntityDetailsForm } from './EntityDetailsForm/components/abstractForm';
export { SobekProvider, useSobekCtx } from './context/SobekContext';
export type { SobekCtx } from './context/SobekContext';
// Edit-session chrome. The data-aware wrappers render `EditFooter` themselves;
// both are exported for hosts driving the presentational form directly, and for
// the save feedback the wrappers only report through `onSaved` / `onError`.
export { EditFooter } from './EntityDetailsForm/components/EditFooter';
export { SaveSnackbar } from './EntityDetailsForm/components/SaveSnackbar';
export type {
  EditFooterProps,
  EditFooterLabels,
  EditFooterSlotProps,
  EditFooterHostProps,
} from './EntityDetailsForm/components/EditFooter';
export type { SaveSnackbarProps, SaveToast } from './EntityDetailsForm/components/SaveSnackbar';
// Loading chrome. The wrappers render these themselves; exported for a host
// driving the presentational form during its own fetch. The skeleton's shape is
// derived from a `FIELDS` registry, so it never drifts from the form.
export { FormSkeleton, FormArrival } from './EntityDetailsForm/components/FormSkeleton';
export type {
  FormSkeletonProps,
  FormSkeletonHostProps,
  FormArrivalProps,
} from './EntityDetailsForm/components/FormSkeleton';
// In-page navigation for a stacked form. `SectionToc` is standalone (no form
// dependency); `resolveSections` yields the sections a given registry + layout
// will actually render, so the list it is fed can't drift from the form.
export { SectionToc } from './SectionToc';
export type { SectionTocProps } from './SectionToc';
export { resolveSections } from './EntityDetailsForm/utils/sections';
export type { Section, ResolvedField } from './EntityDetailsForm/utils/sections';
// Generated wrappers + their props types: VehicleTypeForm/VehicleTypeFormProps,
// VehicleForm/VehicleFormProps. Re-exported wholesale rather than named, so a
// new manifest entry reaches the public API the moment it is generated.
export * from './EntityDetailsForm/formImpls';
export type {
  EntityDetailsFormProps,
  EntityDetailsForm,
  FieldSpec,
  FieldKind,
  FieldEntry,
  LayoutItem,
  Layout,
  LayoutVariant,
  ControlSlotProps,
  RefOption,
} from './EntityDetailsForm/types';

// Generated entity types + field registries: VehicleType, VehicleTypeLayout,
// vehicleTypeFields, Vehicle, VehicleLayout, vehicleFields.
export * from './entities';

// Collection: a presentational list (DataGrid or cards) with a shared filter
// limited to what sobek's list query accepts. `<Entity>FilterFields` is the
// generated map of filterable fields; `toSobekFilter` turns the collection's
// filters into the list query's `filter` argument for a host that delegates.
export * from './EntityCollection';
