import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
export default tseslint.config({ ignores: ["dist/"] }, js.configs.recommended, ...tseslint.configs.strictTypeChecked, eslintConfigPrettier, {
    languageOptions: {
        globals: { ...globals.browser },
        parserOptions: {
            projectService: true,
            tsconfigRootDir: import.meta.dirname,
        },
    },
    rules: {
        "@typescript-eslint/restrict-template-expressions": [
            "error",
            { allowNumber: true },
        ],
    },
}, {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
    },
});
