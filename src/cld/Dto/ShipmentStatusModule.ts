import { Module } from "@nestjs/common";
import { ShipmentStatusService } from "./shipment-status.service";

@Module({
  providers: [ShipmentStatusService],
  exports: [ShipmentStatusService],
})
export class ShipmentStatusModule {}
