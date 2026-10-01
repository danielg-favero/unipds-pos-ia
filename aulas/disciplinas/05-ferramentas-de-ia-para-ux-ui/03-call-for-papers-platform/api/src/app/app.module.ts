import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SpeakersModule } from './speakers/speakers.module';

@Module({
  imports: [SpeakersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
