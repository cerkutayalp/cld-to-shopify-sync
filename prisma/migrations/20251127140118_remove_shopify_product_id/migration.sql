/*
  Warnings:

  - You are about to drop the column `shopifyProductId` on the `ProductLog` table. All the data in the column will be lost.
  - You are about to drop the column `shopifyProductId` on the `StockLog` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "data" JSONB NOT NULL
);
INSERT INTO "new_ProductLog" ("action", "data", "id", "notes", "sku", "timestamp", "title") SELECT "action", "data", "id", "notes", "sku", "timestamp", "title" FROM "ProductLog";
DROP TABLE "ProductLog";
ALTER TABLE "new_ProductLog" RENAME TO "ProductLog";
CREATE TABLE "new_StockLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "notes" TEXT,
    "data" JSONB NOT NULL
);
INSERT INTO "new_StockLog" ("action", "data", "id", "notes", "sku", "timestamp") SELECT "action", "data", "id", "notes", "sku", "timestamp" FROM "StockLog";
DROP TABLE "StockLog";
ALTER TABLE "new_StockLog" RENAME TO "StockLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
