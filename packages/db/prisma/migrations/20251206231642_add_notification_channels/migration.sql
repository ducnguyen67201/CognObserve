-- CreateTable
CREATE TABLE "notification_channels" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "config" JSONB NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_channel_links" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_channel_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_channels_workspaceId_idx" ON "notification_channels"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channels_workspaceId_name_key" ON "notification_channels"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "alert_channel_links_alertId_idx" ON "alert_channel_links"("alertId");

-- CreateIndex
CREATE INDEX "alert_channel_links_channelId_idx" ON "alert_channel_links"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "alert_channel_links_alertId_channelId_key" ON "alert_channel_links"("alertId", "channelId");

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_channel_links" ADD CONSTRAINT "alert_channel_links_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_channel_links" ADD CONSTRAINT "alert_channel_links_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "notification_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
