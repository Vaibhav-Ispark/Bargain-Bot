-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetSettings" (
    "id" SERIAL NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WidgetSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRule" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "triggerQuantity" INTEGER NOT NULL DEFAULT 1,
    "openingDiscount" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "maxDiscount" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "concessionStep" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "maxRounds" INTEGER NOT NULL DEFAULT 3,
    "dealExpiryMins" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantityTier" (
    "id" SERIAL NOT NULL,
    "productRuleId" INTEGER NOT NULL,
    "minQty" INTEGER NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "QuantityTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BargainSession" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "productRuleId" INTEGER NOT NULL,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "currentDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "agreedQty" INTEGER,
    "agreedDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastQty" INTEGER,
    "usedResponseIds" TEXT NOT NULL DEFAULT '[]',
    "transcript" TEXT NOT NULL DEFAULT '[]',
    "sensitivityScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "highDiscountAsked" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastMsgAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BargainSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "productRuleId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "finalQty" INTEGER NOT NULL,
    "finalDiscount" DOUBLE PRECISION NOT NULL,
    "discountCode" TEXT NOT NULL,
    "discountNodeId" TEXT NOT NULL DEFAULT '',
    "priceRuleId" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "shopifyOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WidgetSettings_shop_key" ON "WidgetSettings"("shop");

-- CreateIndex
CREATE INDEX "ProductRule_shop_idx" ON "ProductRule"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRule_shop_productId_key" ON "ProductRule"("shop", "productId");

-- CreateIndex
CREATE INDEX "BargainSession_shop_idx" ON "BargainSession"("shop");

-- CreateIndex
CREATE INDEX "BargainSession_shop_status_idx" ON "BargainSession"("shop", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_sessionId_key" ON "Deal"("sessionId");

-- CreateIndex
CREATE INDEX "Deal_shop_idx" ON "Deal"("shop");

-- CreateIndex
CREATE INDEX "Deal_shop_converted_idx" ON "Deal"("shop", "converted");

-- AddForeignKey
ALTER TABLE "QuantityTier" ADD CONSTRAINT "QuantityTier_productRuleId_fkey" FOREIGN KEY ("productRuleId") REFERENCES "ProductRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BargainSession" ADD CONSTRAINT "BargainSession_productRuleId_fkey" FOREIGN KEY ("productRuleId") REFERENCES "ProductRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BargainSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_productRuleId_fkey" FOREIGN KEY ("productRuleId") REFERENCES "ProductRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
