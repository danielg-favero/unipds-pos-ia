import test from "node:test";
import assert from "node:assert/strict";

import { createServer } from "../src/server.ts";

test.todo("Command upper transform messages into UPPERCASE", async () => {
  const app = createServer();

  const message = "Make thIS messAge UPPERCASE";
  const expected = message.toUpperCase();

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    body: {
      question: message,
    },
  });

  assert.equal(response.body, expected);
});

test.todo("Command upper transform messages into LOWERCASE", async () => {
  const app = createServer();

  const message = "Make thIS messAge LOWercase";
  const expected = message.toLowerCase();

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    body: {
      question: message,
    },
  });

  assert.equal(response.body, expected);
});

test.todo("Command upper transform messages into UNKOWN", async () => {
  const app = createServer();

  const message = "hey what is the date today?";
  const expected =
    "Unkwon command. Try 'make this uppercase' or 'make this lowercase'";

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    body: {
      question: message,
    },
  });

  assert.equal(response.body, expected);
});
