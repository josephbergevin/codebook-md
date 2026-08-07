import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    // Generated cell-execution scratch files - written at runtime into the
    // configured execPath, not source. Matches the .gitignore entry.
    ignores: [
      "**/codebook_md_exec*",
      "**/apiplayground/**"
    ]
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        __dirname: "readonly",
        require: "readonly",
        module: "readonly"
      }
    }
  },
  {
    files: ["webpack.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        __dirname: "readonly",
        require: "readonly",
        module: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-var-requires": "off"
    }
  },
  {
    files: ["__mocks__/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        jest: "readonly",
        require: "readonly",
        module: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-var-requires": "off"
    }
  }
];
