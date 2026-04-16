import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: ["**/dist/**", "**/node_modules/**", "**/.gemini/**", "**/brain/**", "**/coverage/**"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": "warn",
            "no-undef": "off" // TypeScript handles this
        }
    }
);
