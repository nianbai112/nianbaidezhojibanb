-- Drop old share tables
DROP TABLE IF EXISTS share_invites;
DROP TABLE IF EXISTS share_settings;

-- Create enums
CREATE TYPE "ShareInviteStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE "ShareRewardType" AS ENUM ('INVITER', 'INVITEE');
CREATE TYPE "ShareRewardStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE "ShareUserLimit" AS ENUM ('ALL_USERS', 'NEW_USERS');

-- Create new share_settings table
CREATE TABLE share_settings (
    id                TEXT PRIMARY KEY,
    "regionId"        TEXT NOT NULL UNIQUE,
    "isEnabled"       BOOLEAN NOT NULL DEFAULT true,
    "activityTitle"   TEXT,
    "activityImage"   TEXT,
    "activityRules"   TEXT,
    "inviterReward"   DECIMAL(10,2) NOT NULL DEFAULT 0,
    "inviteeReward"   DECIMAL(10,2) NOT NULL DEFAULT 0,
    "userLimit"       "ShareUserLimit" NOT NULL DEFAULT 'ALL_USERS',
    "dailyInviteLimit" INTEGER NOT NULL DEFAULT 100,
    "totalInviteLimit" INTEGER,
    "startTime"       TIMESTAMP(3),
    "endTime"         TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create new share_invites table
CREATE TABLE share_invites (
    id                    TEXT PRIMARY KEY,
    "inviterId"           TEXT NOT NULL,
    "inviteeId"           TEXT NOT NULL,
    "isNewUser"           BOOLEAN NOT NULL DEFAULT false,
    "rewardAmount"        DECIMAL(10,2) NOT NULL DEFAULT 0,
    "inviteeRewardAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    status                "ShareInviteStatus" NOT NULL DEFAULT 'PENDING',
    "failedReason"        TEXT,
    "regionId"            TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_share_invites_inviter FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT fk_share_invites_invitee FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Create share_rewards table
CREATE TABLE share_rewards (
    id                     TEXT PRIMARY KEY,
    "inviteId"             TEXT NOT NULL,
    "userId"               TEXT NOT NULL,
    type                   "ShareRewardType" NOT NULL,
    amount                 DECIMAL(10,2) NOT NULL,
    status                 "ShareRewardStatus" NOT NULL DEFAULT 'SUCCESS',
    "failedReason"         TEXT,
    "relatedTransactionId" TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_share_rewards_invite FOREIGN KEY ("inviteId") REFERENCES "share_invites"("id") ON DELETE CASCADE,
    CONSTRAINT fk_share_rewards_user FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
