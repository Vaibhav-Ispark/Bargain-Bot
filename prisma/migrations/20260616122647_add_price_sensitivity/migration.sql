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
    "agreedDiscount" REAL,
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
INSERT INTO "new_BargainSession" ("agreedDiscount", "agreedQty", "currentDiscount", "currentRound", "customerEmail", "customerId", "id", "lastQty", "productRuleId", "shop", "startedAt", "status", "transcript", "updatedAt", "usedResponseIds") SELECT "agreedDiscount", "agreedQty", "currentDiscount", "currentRound", "customerEmail", "customerId", "id", "lastQty", "productRuleId", "shop", "startedAt", "status", "transcript", "updatedAt", "usedResponseIds" FROM "BargainSession";
DROP TABLE "BargainSession";
ALTER TABLE "new_BargainSession" RENAME TO "BargainSession";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
