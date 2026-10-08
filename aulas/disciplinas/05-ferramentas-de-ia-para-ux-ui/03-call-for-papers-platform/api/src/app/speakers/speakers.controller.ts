import { Body, Controller, Get, Post } from '@nestjs/common';
import { SpeakerDTO, SubmitTalkDto } from '@call-for-papers-platform/shared-types';
import { SpeakersService } from './speakers.service';

@Controller('speakers')
export class SpeakersController {
  constructor(private readonly speakersService: SpeakersService) {}

  @Get()
  findAll(): SpeakerDTO[] {
    return this.speakersService.findAll();
  }

  @Post()
  create(@Body() dto: SubmitTalkDto): SpeakerDTO {
    return this.speakersService.create(dto);
  }
}
