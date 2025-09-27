// ecosystem.config.js
module.exports = {
  apps: [
    // --- 2) Prisma Studio ---
    // NOTE: By default we bind to 127.0.0.1 for safety.
    // If you must expose it, switch host to "0.0.0.0" and firewall/protect it.
    {
      name: "prisma-studio",
      script: "npx",
      args: "prisma studio --port 5555 --hostname 127.0.0.1",
      cwd: "/var/www/cld-to-shopify-sync",
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "development",
        DATABASE_URL: "file:./dev.db", // or your real URL, e.g. sqlite/postgres/etc.
      },
      out_file: "./logs/prisma-studio.out.log",
      error_file: "./logs/prisma-studio.err.log",
      merge_logs: true,
      autorestart: true,
      max_restarts: 100,
      restart_delay: 4000,
    },
  ],
};
