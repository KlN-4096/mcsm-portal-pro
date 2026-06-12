/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./src/visualization/layouts/**/*.{ts,tsx}"],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        minecraft: ['"Minecraft"', '"Unifont"', "sans-serif"],
        "minecraft-five": [
          '"Minecraft Five"',
          '"Vonwaon Bitmap 12px"',
          '"Minecraft"',
          '"Unifont"',
          "sans-serif",
        ],
        "minecraft-ten": [
          '"Minecraft Ten"',
          '"Vonwaon Bitmap 12px"',
          '"Minecraft"',
          '"Unifont"',
          "sans-serif",
        ],
        monocraft: ['"Monocraft"', '"Minecraft"', '"Unifont"', "monospace"],
      },
    },
  },
};
