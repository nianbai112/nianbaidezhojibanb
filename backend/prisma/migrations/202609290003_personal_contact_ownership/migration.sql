-- Historical public contacts retain NULL ownership and remain administrator-managed.
-- Never infer ownership from the last editor or assign historical private rows to an arbitrary user.
ALTER TABLE "contacts" ADD COLUMN "userId" TEXT;
CREATE INDEX "contacts_userId_categoryId_idx" ON "contacts"("userId", "categoryId");
