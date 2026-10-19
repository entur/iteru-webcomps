/** Image imports resolve to their URL (Vite / Storybook / Vitest). */
declare module '*.png' {
  const src: string;
  export default src;
}
