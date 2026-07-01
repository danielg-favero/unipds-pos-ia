import { createServer } from "./server.ts";
import { CONFIG } from "./config.ts";
import { OpenRouterService } from "./openrouter-service.ts";

const openRouterService = new OpenRouterService(CONFIG);

const app = createServer(openRouterService);

app.listen({ port: 3333, host: "0.0.0.0" }, () => {
  console.log("Server running at http://localhost:3333");
});

// app
//   .inject({
//     method: "POST",
//     url: "/chat",
//     body: {
//       question: "Hello",
//     },
//   })
//   .then((response) => {
//     console.log("Response status: ", response.statusCode);
//     console.log("Response body: ", response.body);
//   });
