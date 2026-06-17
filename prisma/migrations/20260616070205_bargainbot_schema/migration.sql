-- CreateTable
CREATE TABLE "Merchant" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "accessToken" TEXT NOT NULL,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plan" TEXT NOT NULL DEFAULT 'free'
);

-- CreateTable
CREATE TABLE "WidgetSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "botName" TEXT NOT NULL DEFAULT 'BargainBot',
    "primaryColor" TEXT NOT NULL DEFAULT '#008060',
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "position" TEXT NOT NULL DEFAULT 'bottom-right',
    "greeting" TEXT NOT NULL DEFAULT 'Hey! Want to make a deal? Tell me how many you''d like and we''ll see what we can do 🤝',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WidgetSettings_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Merchant" ("shop") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductRule" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductRule_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Merchant" ("shop") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuantityTier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productRuleId" INTEGER NOT NULL,
    "minQty" INTEGER NOT NULL,
    "discount" REAL NOT NULL,
    CONSTRAINT "QuantityTier_productRuleId_fkey" FOREIGN KEY ("productRuleId") REFERENCES "ProductRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BargainSession" (
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
    CONSTRAINT "BargainSession_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Merchant" ("shop") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BargainSession_productRuleId_fkey" FOREIGN KEY ("productRuleId") REFERENCES "ProductRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deal" (
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
    CONSTRAINT "Deal_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Merchant" ("shop") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BargainSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deal_productRuleId_fkey" FOREIGN KEY ("productRuleId") REFERENCES "ProductRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WidgetSettings_shop_key" ON "WidgetSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRule_shop_productId_key" ON "ProductRule"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_sessionId_key" ON "Deal"("sessionId");
