import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Estoque e sessão são lidos a cada requisição. O cache de página estática
  // não se aplica a um painel autenticado com saldo em tempo real.
  cacheComponents: false,
  serverExternalPackages: ["bcryptjs", "exceljs", "pdf-lib"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
