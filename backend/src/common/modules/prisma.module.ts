import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { AdminDataScopeService } from '../services/admin-data-scope.service';
import { PrivateMessagePermissionService } from '../services/private-message-permission.service';
import { InteractionPermissionService } from '../services/interaction-permission.service';
import { UserAccessPolicyService } from '../services/user-access-policy.service';

@Global()
@Module({
  providers: [PrismaService, AdminDataScopeService, PrivateMessagePermissionService, InteractionPermissionService, UserAccessPolicyService],
  exports: [PrismaService, AdminDataScopeService, PrivateMessagePermissionService, InteractionPermissionService, UserAccessPolicyService],
})
export class PrismaModule {}
