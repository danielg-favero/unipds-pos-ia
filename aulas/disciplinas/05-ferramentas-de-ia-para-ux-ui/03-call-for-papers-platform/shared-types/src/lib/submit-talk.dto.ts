import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class SubmitTalkDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  talkTitle!: string;

  @IsBoolean()
  isGDE!: boolean;
}
