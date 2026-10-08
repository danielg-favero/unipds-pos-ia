import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SpeakersController } from './speakers.controller';
import { SpeakersService } from './speakers.service';

describe('SpeakersController', () => {
  let app: INestApplication;
  let server: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SpeakersController],
      providers: [SpeakersService],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0);
    server = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (body: unknown) =>
    fetch(`${server}/speakers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const list = () => fetch(`${server}/speakers`);

  const valid = { name: 'Ada', talkTitle: 'Signals in Angular', isGDE: true };

  it('lists submissions: empty array first, then every created talk', async () => {
    const empty = await list();
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);

    await post(valid);
    await post({ ...valid, name: 'Grace', isGDE: false });
    const res = await list();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      expect.objectContaining({ ...valid, id: expect.any(String) }),
      expect.objectContaining({ name: 'Grace', isGDE: false, id: expect.any(String) }),
    ]);
  });

  it('accepts a valid payload and returns the created submission', async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(expect.objectContaining({ ...valid, id: expect.any(String) }));
  });

  it('rejects a payload missing talkTitle with 400', async () => {
    const res = await post({ name: 'Ada', isGDE: true });
    expect(res.status).toBe(400);
  });

  it('rejects a payload with isGDE of the wrong type with 400', async () => {
    const res = await post({ ...valid, isGDE: 'yes' });
    expect(res.status).toBe(400);
  });

  it('rejects a payload with an unknown field with 400', async () => {
    const res = await post({ ...valid, extra: 'nope' });
    expect(res.status).toBe(400);
  });
});
