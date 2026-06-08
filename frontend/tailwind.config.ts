import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f7fb",
          100: "#eceef5",
          800: "#1a1c25",
          900: "#0f1117",
          950: "#080a0f",
        },
        accent: {
          DEFAULT: "#ff4b4b",
          soft: "#ff7c7c",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
