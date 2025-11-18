// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "nest-api",
      // preload tsconfig-paths so dist can resolve TS aliases
     args: "-r module-alias/register --enable-source-maps dist/src/main.js",    
//  args: "-r tsconfig-paths/register --enable-source-maps dist/src/main.js",
      cwd: "/var/www/cld-to-shopify-sync",       // <-- match your real path
      instances: 1,                               // or "max" with exec_mode: "cluster"
      script: "dist/src/main.js",          // <-- your compiled entry
      node_args: "-r module-alias/register --enable-source-maps", // preload module-alias
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "development",
        PORT: "3100",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: "3100",
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
      args: "prisma studio --port 5555 --hostname 0.0.0.0",
      cwd: "/var/www/cld-to-shopify-sync",
      exec_mode: "fork",
      watch: false,
      out_file: "./logs/prisma-studio.out.log",
      error_file: "./logs/prisma-studio.err.log",
      merge_logs: true,
    },
  ],
};
