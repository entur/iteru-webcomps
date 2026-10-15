/**
 * Internal barrel for EntityDetailsForm (not the public API).
 */
export { createAbstractEntityDetailsForm } from './components/abstractForm';
export { useEntityForm } from './hooks/useEntityForm';
export { EditFooter } from './components/EditFooter';
export { FormSkeleton, FormArrival } from './components/FormSkeleton';
export { SaveSnackbar } from './components/SaveSnackbar';
export type { EditFooterProps, EditFooterLabels, EditFooterSlotProps, EditFooterHostProps } from './components/EditFooter';
export type { SaveSnackbarProps, SaveToast } from './components/SaveSnackbar';
export type { FormSkeletonProps, FormSkeletonHostProps, FormArrivalProps } from './components/FormSkeleton';
export { toInputEntity } from './utils/toInput';
export { normalizeEntityErrors } from './utils/normalizeErrors';
export type {
  EntityDetailsFormProps,
  FieldSpec,
  FieldKind,
  FieldEntry,
  LayoutItem,
  Layout,
  LayoutVariant,
  PatchedDisplay,
  ControlSlotProps,
  RefOption,
} from './types';
