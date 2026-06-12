import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ALLOY palette — graphite + warm brass, evoking metal & joinery
        ink:    "#1A1C1E",   // near-black graphite (primary text / sidebar)
        slate:  "#3A3F44",
        mist:   "#EDEBE7",   // warm off-white background
        paper:  "#FFFFFF",
        brass:  "#B08D57",   // signature warm metal accent
        brassdk:"#8A6D3F",
        sage:   "#5B6E5A",   // success / approved
        rust:   "#A6492E",   // alerts / overdue
        line:   "#D9D5CE",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.75rem",
      },
    },
  },
  plugins: [],
};
export default config;
