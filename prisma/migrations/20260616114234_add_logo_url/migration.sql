-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WidgetSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "botName" TEXT NOT NULL DEFAULT 'BargainBot',
    "primaryColor" TEXT NOT NULL DEFAULT '#008060',
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "position" TEXT NOT NULL DEFAULT 'bottom-right',
    "greeting" TEXT NOT NULL DEFAULT 'Hey! Want to make a deal? Tell me how many you''d like and we''ll see what we can do 🤝',
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_WidgetSettings" ("botName", "createdAt", "greeting", "id", "position", "primaryColor", "shop", "tone", "updatedAt") SELECT "botName", "createdAt", "greeting", "id", "position", "primaryColor", "shop", "tone", "updatedAt" FROM "WidgetSettings";
DROP TABLE "WidgetSettings";
ALTER TABLE "new_WidgetSettings" RENAME TO "WidgetSettings";
CREATE UNIQUE INDEX "WidgetSettings_shop_key" ON "WidgetSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
