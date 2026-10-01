import { SpeakersService } from './speakers.service';

describe('SpeakersService', () => {
  let service: SpeakersService;
  const dto = { name: 'Ada', talkTitle: 'Signals in Angular', isGDE: false };

  beforeEach(() => {
    service = new SpeakersService();
  });

  it('creates a speaker with a generated id', () => {
    const speaker = service.create(dto);
    expect(speaker).toEqual({ ...dto, id: expect.any(String) });
  });

  it('lists created speakers', () => {
    const a = service.create(dto);
    const b = service.create({ ...dto, name: 'Grace' });
    expect(service.findAll()).toEqual([a, b]);
  });

  it('returns a copy so callers cannot mutate the store', () => {
    service.create(dto);
    service.findAll().pop();
    expect(service.findAll()).toHaveLength(1);
  });
});
