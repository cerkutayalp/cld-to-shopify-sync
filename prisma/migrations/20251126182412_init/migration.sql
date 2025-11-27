-- AlterTable
ALTER TABLE "ProductLog" ADD COLUMN "shopifyProductId" TEXT;

-- AlterTable
ALTER TABLE "StockLog" ADD COLUMN "shopifyProductId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrderLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "cldOrderId" TEXT,
    "shopifyCustomerId" TEXT,
    "cldCustomerId" TEXT,
    "notes" TEXT,
    "data" JSONB
);
INSERT INTO "new_OrderLog" ("action", "data", "id", "notes", "shopifyOrderId", "timestamp") SELECT "action", "data", "id", "notes", "shopifyOrderId", "timestamp" FROM "OrderLog";
DROP TABLE "OrderLog";
ALTER TABLE "new_OrderLog" RENAME TO "OrderLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
