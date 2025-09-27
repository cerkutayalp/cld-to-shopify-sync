import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // makes PrismaService available everywhere without re-imports
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // export so other modules can use it
})
export class PrismaModule {}
