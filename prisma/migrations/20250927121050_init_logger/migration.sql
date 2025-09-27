-- CreateTable
CREATE TABLE "ProductLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "data" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "StockLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "notes" TEXT,
    "data" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "OrderLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "notes" TEXT,
    "data" JSONB NOT NULL
);
