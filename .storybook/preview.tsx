import type { Preview } from "@storybook/react-vite";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { SobekProvider } from "../src/context/SobekContext";
import { MOCK_ENDPOINT, MOCK_OWNER_REF } from "../src/stories/mockEndpoint";

/**
 * Storybook-only MUI theme. Consumers supply their own theme in production —
 * this exists purely to present the components on a clean, branded surface.
 * A restrained Entur-leaning palette (deep teal) with IBM Plex Sans (loaded in
 * `preview-head.html`) instead of the default Roboto.
 */
const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#11616f" },
    secondary: { main: "#e8663d" },
    background: { default: "#f4f1ea", paper: "#ffffff" },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
  },
});

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: { default: "paper" },
    // Sidebar order: HostPages on top (Fullpage first within it — Storybook
    // opens the first story, so this makes Fullpage the landing page), then
    // DataGrid, then Forms, then anything else A–Z.
    options: {
      storySort: {
        order: [
          "HostPages",
          ["Fullpage", "*"],
          "DataGrid",
          "Forms",
          "*",
        ],
      },
    },
  },
  decorators: [
    // Mandatory session inputs for every data-aware component (issue #8).
    (Story) => (
      <SobekProvider
        value={{ endpoint: MOCK_ENDPOINT, dataOwnerRef: MOCK_OWNER_REF }}
      >
        <Story />
      </SobekProvider>
    ),
    (Story) => (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default preview;
