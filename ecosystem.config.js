// ecosystem.config.js
module.exports = {
  apps: [
    // --- 1) NestJS API ---
    {
      name: "nest-api",
      // If you build first: "npm run build" -> dist/main.js
      // You can also use: script: "npm", args: "run start:prod"
      script: "node",
      args: "dist/main.js",
      cwd: "/var/www/cld-to-shopify-sync", 
      instances: process.env.WEB_CONCURRENCY || 1, // or "max"
      exec_mode: "fork", // use "cluster" for multi-core API
      watch: false,      // set true only in dev; in prod keep false
      env: {
        NODE_ENV: "development",
        PORT: "3000",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      out_file: "./logs/nest-api.out.log",
      error_file: "./logs/nest-api.err.log",
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 4000,
    },

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
