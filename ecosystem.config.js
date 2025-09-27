// ecosystem.config.js
module.exports = {
  apps: [
    // --- 1) NestJS API ---
    {
      name: "nest-api",
      // If you build first: "npm run build" -> dist/main.js
      // You can also use: script: "npm", args: "run start:prod"

      script: "dist/src/main.js",
      args: "./src/main.ts",

      cwd: "/var/www/cld-to-shopify-sync",
      instances: process.env.WEB_CONCURRENCY || 1, // or "max"
      exec_mode: "fork", // use "cluster" for multi-core API
      watch: false, // set true only in dev; in prod keep false
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
  ],
};
