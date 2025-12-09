import type { Config } from "tailwindcss";
// @ts-expect-error - bypassing missing package export
import konstaPluginColors from './node_modules/konsta/plugin-colors.js';
import path from "path";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    path.join(process.cwd(), "node_modules/konsta/**/*.{js,jsx,ts,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        primary: '#FACC15',
        'brand-primary': '#FACC15',
      }
    },
  },
  plugins: [konstaPluginColors],
};

export default config;
