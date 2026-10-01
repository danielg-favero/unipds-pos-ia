import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SpeakerDTO, SubmitTalkDto } from '@call-for-papers-platform/shared-types';

@Injectable()
export class SpeakersService {
  private readonly speakers: SpeakerDTO[] = [];

  create(dto: SubmitTalkDto): SpeakerDTO {
    const speaker: SpeakerDTO = {
      id: randomUUID(),
      name: dto.name,
      talkTitle: dto.talkTitle,
      isGDE: dto.isGDE,
    };
    this.speakers.push(speaker);
    return speaker;
  }

  findAll(): SpeakerDTO[] {
    return [...this.speakers];
  }
}
