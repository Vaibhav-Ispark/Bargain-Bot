-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BargainSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "productRuleId" INTEGER NOT NULL,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "currentDiscount" REAL NOT NULL DEFAULT 0,
    "agreedQty" INTEGER,
    "agreedDiscount" REAL NOT NULL DEFAULT 0,
    "lastQty" INTEGER,
    "usedResponseIds" TEXT NOT NULL DEFAULT '[]',
    "transcript" TEXT NOT NULL DEFAULT '[]',
    "sensitivityScore" REAL NOT NULL DEFAULT 50,
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "highDiscountAsked" REAL NOT NULL DEFAULT 0,
    "lastMsgAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BargainSession_productRuleId_fkey" FOREIGN KEY ("productRuleId") REFERENCES "ProductRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BargainSession" ("agreedDiscount", "agreedQty", "currentDiscount", "currentRound", "customerEmail", "customerId", "highDiscountAsked", "id", "lastMsgAt", "lastQty", "productRuleId", "rejectionCount", "sensitivityScore", "shop", "startedAt", "status", "transcript", "updatedAt", "usedResponseIds") SELECT coalesce("agreedDiscount", 0) AS "agreedDiscount", "agreedQty", "currentDiscount", "currentRound", "customerEmail", "customerId", "highDiscountAsked", "id", "lastMsgAt", "lastQty", "productRuleId", "rejectionCount", "sensitivityScore", "shop", "startedAt", "status", "transcript", "updatedAt", "usedResponseIds" FROM "BargainSession";
DROP TABLE "BargainSession";
ALTER TABLE "new_BargainSession" RENAME TO "BargainSession";
CREATE INDEX "BargainSession_shop_idx" ON "BargainSession"("shop");
CREATE INDEX "BargainSession_shop_status_idx" ON "BargainSession"("shop", "status");
CREATE TABLE "new_Deal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "productRuleId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "finalQty" INTEGER NOT NULL,
    "finalDiscount" REAL NOT NULL,
    "discountCode" TEXT NOT NULL,
    "discountNodeId" TEXT NOT NULL DEFAULT '',
    "priceRuleId" TEXT NOT NULL DEFAULT '',
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
CREATE INDEX "Deal_shop_idx" ON "Deal"("shop");
CREATE INDEX "Deal_shop_converted_idx" ON "Deal"("shop", "converted");
CREATE TABLE "new_WidgetSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "botName" TEXT NOT NULL DEFAULT 'BargainBot',
    "primaryColor" TEXT NOT NULL DEFAULT '#008060',
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "position" TEXT NOT NULL DEFAULT 'bottom-right',
    "greeting" TEXT NOT NULL DEFAULT 'Hey! Want to make a deal? Tell me how many you''d like and we''ll see what we can do 🤝',
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "proactiveTrigger" BOOLEAN NOT NULL DEFAULT true,
    "proactiveDelay" INTEGER NOT NULL DEFAULT 30,
    "proactiveMessage" TEXT NOT NULL DEFAULT 'Psst — want a deal? 👀',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_WidgetSettings" ("botName", "createdAt", "greeting", "id", "logoUrl", "position", "primaryColor", "shop", "tone", "updatedAt") SELECT "botName", "createdAt", "greeting", "id", "logoUrl", "position", "primaryColor", "shop", "tone", "updatedAt" FROM "WidgetSettings";
DROP TABLE "WidgetSettings";
ALTER TABLE "new_WidgetSettings" RENAME TO "WidgetSettings";
CREATE UNIQUE INDEX "WidgetSettings_shop_key" ON "WidgetSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductRule_shop_idx" ON "ProductRule"("shop");
