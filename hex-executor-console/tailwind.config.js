/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        hex: {
          bg: "#0f172a",
          panel: "#0c1222",
          bubbleUser: "#1f2937",
          bubbleAi: "#111827",
          border: "rgba(255,255,255,0.08)",
          muted: "#9ca3af",
          text: "#e5e7eb",
        },
      },
    },
  },
  plugins: [],
};
