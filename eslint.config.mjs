import js from "@eslint/js";
import globals from "globals";

export default [
  // Global ignores
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      ".cache/",
      "uploads/resources/",
      "uploads/thumbnails/",
      "prisma/dev.db",
      "prisma/test-restore.db",
      "*.db",
      "backups/",
      "*.backup",
      "logs/",
      "*.log",
      ".env*",
      ".vscode/",
      ".idea/",
      ".cursor/",
      ".cursor_data/",
      "*.tmp",
      "temp/",
      ".DS_Store",
      "Thumbs.db",
      ".git/",
      "package-lock.json"
    ]
  },
  
  // JavaScript/Node.js files
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      // Custom rules for this project
      "no-console": "warn",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "prefer-const": "error",
      "no-var": "error"
    }
  },
  
  // Frontend JavaScript (browser-only)
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    },
    rules: {
      "no-console": "off" // Allow console in frontend for debugging
    }
  },
  
  // Backend JavaScript (node-only)
  {
    files: ["server.js", "scripts/**/*.js", "utils/**/*.js", "models/**/*.js", "middleware/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-console": "warn" // Warn about console in backend
    }
  }
];
