import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Utilidades sueltas que NO forman parte de la aplicación: parches de una
    // sola vez, migraciones ya aplicadas y pruebas de andar por casa. Next no
    // las compila, así que revisarlas solo añade cientos de avisos que tapan
    // los de verdad —entre ellos, ocho componentes sin definir que parecían
    // fallos de la aplicación y son de un script viejo—.
    "scripts/**",
    "scratch/**",
    "*.js",
    "*.mjs",
    "!eslint.config.mjs",
    "!next.config.mjs",
  ]),
]);

export default eslintConfig;
