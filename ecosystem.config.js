// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "nest-api",
      script: "node",
      // preload tsconfig-paths so dist can resolve TS aliases
      args: "-r tsconfig-paths/register --enable-source-maps dist/src/main.js",
      cwd: "/var/www/cld-to-shopify-sync",       // <-- match your real path
      instances: 1,                               // or "max" with exec_mode: "cluster"
      exec_mode: "fork",
      watch: false,
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

    // Optional: Prisma Studio (binds to localhost for safety)
    {
      name: "prisma-studio",
      script: "npx",
      args: "prisma studio --port 5555 --hostname 127.0.0.1",
      cwd: "/var/www/cld-to-shopify-sync",
      exec_mode: "fork",
      watch: false,
      out_file: "./logs/prisma-studio.out.log",
      error_file: "./logs/prisma-studio.err.log",
      merge_logs: true,
    },
  ],
};
