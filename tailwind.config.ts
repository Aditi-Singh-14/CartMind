import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        razorpay: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc7fd',
          400: '#36a9fc',
          500: '#0c8df6',
          600: '#006ed8',
          700: '#0058b0',
          800: '#054a91',
          900: '#0a3e78',
          950: '#072750',
          blue: '#3395FF',
          darkBlue: '#0C2340',
        },
      },
    },
  },
  plugins: [],
};
export default config;
