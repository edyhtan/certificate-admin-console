import { Module } from '@nestjs/common';
import { SerialService } from './serial.js';

@Module({
  providers: [SerialService],
  exports: [SerialService],
})
export class SerialsModule {}
