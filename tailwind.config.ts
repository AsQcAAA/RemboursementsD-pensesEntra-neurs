import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Couleurs officielles As de Québec AAA (asdequebecaaa.com) : noir + or.
        // Mêmes valeurs que l'appli M17 (as-quebec-m17/tailwind.config.ts), pour
        // que les deux sites soient visiblement de la même famille.
        gold: {
          50: "#fffdf5",
          100: "#fff6d9",
          200: "#ffe9a3",
          300: "#ffdc6d",
          400: "#fdcf47",
          500: "#fdca37",
          600: "#e0ac1d",
          700: "#b98816",
          800: "#8f680f",
          900: "#664908",
        },
        ink: {
          50: "#f5f5f5",
          100: "#e5e5e5",
          200: "#cccccc",
          300: "#999999",
          400: "#666666",
          500: "#3a3535",
          600: "#2a2626",
          700: "#1e1b1b",
          800: "#171414",
          900: "#0d0c0c",
        },
      },
    },
  },
  plugins: [],
};
export default config;
