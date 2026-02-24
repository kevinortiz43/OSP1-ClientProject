import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import "dotenv/config";
import { router } from "./router/router";

const app = new Elysia({ prefix: "/api" });
const corsOptions = {
  origin: "http://localhost:5173",
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.listen(process.env.PORT, () => {
  console.log(`Server listening on port ${process.env.PORT}`);
});

app.use(router);

export default app;
