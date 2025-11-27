/*
  Warnings:

  - You are about to drop the column `data` on the `OrderLog` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrderLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "shopifyOrderId" TEXT,
    "shopifyCustomerId" TEXT,
    "shopifyData" JSONB,
    "cldOrderId" TEXT,
    "cldCustomerId" TEXT,
    "cldData" JSONB,
    "notes" TEXT
);
INSERT INTO "new_OrderLog" ("action", "cldCustomerId", "cldOrderId", "id", "notes", "shopifyCustomerId", "shopifyOrderId", "timestamp") SELECT "action", "cldCustomerId", "cldOrderId", "id", "notes", "shopifyCustomerId", "shopifyOrderId", "timestamp" FROM "OrderLog";
DROP TABLE "OrderLog";
ALTER TABLE "new_OrderLog" RENAME TO "OrderLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
