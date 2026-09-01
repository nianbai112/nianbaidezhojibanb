DROP INDEX `rider_settlement_items_orderType_orderId_key`
  ON `rider_settlement_items`;

UPDATE `rider_settlements`
SET `periodKey` = NULL
WHERE `status` = 'REJECTED';

CREATE UNIQUE INDEX `rider_settlement_items_settlementId_orderType_orderId_key`
  ON `rider_settlement_items`(`settlementId`, `orderType`, `orderId`);
