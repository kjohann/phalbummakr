import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src-tauri/target/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "react-dom", "konva", "react-konva"],
          patterns: ["@tauri-apps/*"],
        },
      ],
    },
  },
);