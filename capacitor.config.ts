import type { CapacitorConfig } from "@capacitor/cli";

// O Android carrega os arquivos locais de dist/; nao carrega o site na URL.
// O backend Convex continua sendo o mesmo utilizado pelo site de producao.
const config: CapacitorConfig = {
  appId: "com.glassfinance.app",
  appName: "Glass Finance",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
