import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtGuard } from "../../guards/jwt.guard";
import { AdminGuard, AdminPermissionGuard } from "../../guards/admin.guard";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { RequirePermission } from "../../decorators/require-permission.decorator";
import { PurchaseService } from "./purchase.service";

@UseGuards(JwtGuard)
@Controller("errand/purchase")
export class PurchaseController {
  constructor(private readonly service: PurchaseService) {}
  @Get("catalog") catalog(@Query("regionId") region: string, @Query("view") view: string) {
    return this.service.catalog(region, view);
  }
  @Get("products") products(@Query() query: any) { return this.service.products(query); }
  @Post("cart-items") cartItems(@Body() body: any) { return this.service.cartItems(body); }
  @Post("quote") quote(@CurrentUser("sub") user: string, @Body() body: any) {
    return this.service.quote(user, body);
  }
  @Post("orders") create(@CurrentUser("sub") user: string, @Body() body: any) {
    return this.service.create(user, body);
  }
  @Get("orders/:id") detail(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
  ) {
    return this.service.detail(id, user);
  }
  @Post("orders/:id/pay") pay(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.pay(id, user, body.changeId);
  }
  @Post("orders/:id/cancel") cancel(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.cancel(id, user, body.reason);
  }
  @Post("orders/:id/changes") propose(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.propose(id, user, body);
  }
  @Post("orders/:id/changes/:changeId/respond") respond(
    @Param("id") id: string,
    @Param("changeId") change: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.respond(id, user, change, body.accept);
  }
  @Post("orders/:id/stops/:stopId/receipt") receipt(
    @Param("id") id: string,
    @Param("stopId") stop: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.receipt(id, user, stop, body);
  }
}

@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
@Controller("admin/errand/purchase")
export class PurchaseAdminController {
  constructor(private readonly service: PurchaseService) {}
  @Get() @RequirePermission("errand:view") data(
    @CurrentUser("sub") user: string,
    @Query() query: any,
  ) {
    return this.service.adminData(user, query.regionId, query);
  }
  @Post("policy") @RequirePermission("errand:config") policy(
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.savePolicy(
      user,
      body.regionId,
      body.policy,
      body.version,
    );
  }
  @Post("shops") @RequirePermission("errand:config") shop(
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.saveShop(user, body.regionId, body);
  }
  @Post("shops/:id/printer") @RequirePermission("errand:config") savePrinter(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.savePrinter(user, body.regionId, id, body);
  }
  @Post("shops/:id/printer/delete") @RequirePermission("errand:config") deletePrinter(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.deletePrinter(user, body.regionId, id);
  }
  @Post("shops/:id/printer/test") @RequirePermission("errand:config") testPrinter(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.testPrinter(user, body.regionId, id);
  }
  @Post("shops/:id/printer/template") @RequirePermission("errand:config") shopTicketTemplate(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.saveShopTicketTemplate(user, body.regionId, id, body.template ?? null);
  }
  @Post("ticket-template") @RequirePermission("errand:config") ticketTemplate(
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.saveTicketTemplate(user, body.regionId, body.template ?? null);
  }
  @Post("ticket-template/preview") @RequirePermission("errand:config") ticketPreview(
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.previewTicket(user, body.regionId, body);
  }
  @Get("shops/:id/printer/status") @RequirePermission("errand:view") printerStatus(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Query("regionId") regionId: string,
  ) {
    return this.service.printerStatus(user, regionId, id);
  }
  @Post("categories") @RequirePermission("errand:config") category(
    @CurrentUser("sub") user: string, @Body() body: any,
  ) { return this.service.saveCategory(user, body.regionId, body); }
  @Post("products") @RequirePermission("errand:config") product(
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.saveProduct(user, body.regionId, body);
  }
  @Post("modifier-groups") @RequirePermission("errand:config") modifierGroup(
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.saveModifierGroup(user, body.regionId, body);
  }
  @Post("modifier-groups/:id/delete") @RequirePermission("errand:config") deleteModifierGroup(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.deleteModifierGroup(user, body.regionId, id, body.version);
  }
  @Post("modifier-options/:id/sold-out") @RequirePermission("errand:config") soldOut(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.setModifierSoldOut(user, body.regionId, id, body.soldOut);
  }
  @Post("combinations") @RequirePermission("errand:config") combination(
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.saveCombination(user, body.regionId, body);
  }
  @Get("orders/:id") @RequirePermission("errand:view") detail(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
  ) {
    return this.service.detail(id, "", user);
  }
  @Post("orders/:id/cancel") @RequirePermission("errand:config") cancel(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.cancel(id, "", body.reason, user);
  }
  @Post("orders/:id/compensation")
  @RequirePermission("order:refund")
  compensate(
    @Param("id") id: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.compensate(user, id, body);
  }
  @Post("orders/:id/refunds/:refundId/retry")
  @RequirePermission("order:refund")
  retry(
    @Param("id") id: string,
    @Param("refundId") refund: string,
    @CurrentUser("sub") user: string,
  ) {
    return this.service.retryRefund(user, id, refund);
  }
  @Post("orders/:id/stops/:stopId/audit")
  @RequirePermission("finance:settlement")
  audit(
    @Param("id") id: string,
    @Param("stopId") stop: string,
    @CurrentUser("sub") user: string,
    @Body() body: any,
  ) {
    return this.service.audit(user, id, stop, body);
  }
}
