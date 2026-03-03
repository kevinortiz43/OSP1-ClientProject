import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import "dotenv/config";
import { router } from "./router/router";

const port = 3000;
const app = new Elysia({ prefix: "/api" });
const corsOptions = {
  origin: "http://localhost:5173",
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

app.use(router);

export default app;
