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
          '"Minecraft"',
          '"Unifont"',
          "sans-serif",
        ],
        "minecraft-ten": [
          '"Minecraft Ten"',
          '"Minecraft"',
          '"Unifont"',
          "sans-serif",
        ],
        monocraft: ['"Monocraft"', '"Minecraft"', '"Unifont"', "monospace"],
      },
    },
  },
};
