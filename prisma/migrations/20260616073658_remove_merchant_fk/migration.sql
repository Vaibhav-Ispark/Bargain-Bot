/*
  Warnings:

  - You are about to drop the `Merchant` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Merchant";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BargainSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "productRuleId" INTEGER NOT NULL,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "currentDiscount" REAL NOT NULL DEFAULT 0,
    "agreedQty" INTEGER,
    "agreedDiscount" REAL,
    "transcript" TEXT NOT NULL DEFAULT '[]',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BargainSession_productRuleId_fkey" FOREIGN KEY ("productRuleId") REFERENCES "ProductRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BargainSession" ("agreedDiscount", "agreedQty", "currentDiscount", "currentRound", "customerId", "id", "productRuleId", "shop", "startedAt", "status", "transcript", "updatedAt") SELECT "agreedDiscount", "agreedQty", "currentDiscount", "currentRound", "customerId", "id", "productRuleId", "shop", "startedAt", "status", "transcript", "updatedAt" FROM "BargainSession";
DROP TABLE "BargainSession";
ALTER TABLE "new_BargainSession" RENAME TO "BargainSession";
CREATE TABLE "new_Deal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "productRuleId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "finalQty" INTEGER NOT NULL,
    "finalDiscount" REAL NOT NULL,
    "discountCode" TEXT NOT NULL,
    "priceRuleId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "shopifyOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BargainSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deal_productRuleId_fkey" FOREIGN KEY ("productRuleId") REFERENCES "ProductRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Deal" ("converted", "createdAt", "discountCode", "expiresAt", "finalDiscount", "finalQty", "id", "priceRuleId", "productId", "productRuleId", "sessionId", "shop", "shopifyOrderId", "updatedAt") SELECT "converted", "createdAt", "discountCode", "expiresAt", "finalDiscount", "finalQty", "id", "priceRuleId", "productId", "productRuleId", "sessionId", "shop", "shopifyOrderId", "updatedAt" FROM "Deal";
DROP TABLE "Deal";
ALTER TABLE "new_Deal" RENAME TO "Deal";
CREATE UNIQUE INDEX "Deal_sessionId_key" ON "Deal"("sessionId");
CREATE TABLE "new_ProductRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "triggerQuantity" INTEGER NOT NULL DEFAULT 1,
    "openingDiscount" REAL NOT NULL DEFAULT 5,
    "maxDiscount" REAL NOT NULL DEFAULT 20,
    "concessionStep" REAL NOT NULL DEFAULT 2,
    "maxRounds" INTEGER NOT NULL DEFAULT 3,
    "dealExpiryMins" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ProductRule" ("concessionStep", "createdAt", "dealExpiryMins", "enabled", "id", "maxDiscount", "maxRounds", "minQuantity", "openingDiscount", "productId", "productTitle", "shop", "triggerQuantity", "updatedAt") SELECT "concessionStep", "createdAt", "dealExpiryMins", "enabled", "id", "maxDiscount", "maxRounds", "minQuantity", "openingDiscount", "productId", "productTitle", "shop", "triggerQuantity", "updatedAt" FROM "ProductRule";
DROP TABLE "ProductRule";
ALTER TABLE "new_ProductRule" RENAME TO "ProductRule";
CREATE UNIQUE INDEX "ProductRule_shop_productId_key" ON "ProductRule"("shop", "productId");
CREATE TABLE "new_WidgetSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "botName" TEXT NOT NULL DEFAULT 'BargainBot',
    "primaryColor" TEXT NOT NULL DEFAULT '#008060',
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "position" TEXT NOT NULL DEFAULT 'bottom-right',
    "greeting" TEXT NOT NULL DEFAULT 'Hey! Want to make a deal? Tell me how many you''d like and we''ll see what we can do 🤝',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_WidgetSettings" ("botName", "createdAt", "greeting", "id", "position", "primaryColor", "shop", "tone", "updatedAt") SELECT "botName", "createdAt", "greeting", "id", "position", "primaryColor", "shop", "tone", "updatedAt" FROM "WidgetSettings";
DROP TABLE "WidgetSettings";
ALTER TABLE "new_WidgetSettings" RENAME TO "WidgetSettings";
CREATE UNIQUE INDEX "WidgetSettings_shop_key" ON "WidgetSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
