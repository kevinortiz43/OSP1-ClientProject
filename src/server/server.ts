import cors from "cors";
import express from "express";
import "dotenv/config";
import router from "./router/router";

const PORT = process.env.PORT || 3000;

const app = express();
const corsOptions = {
  origin: "http://localhost:5173",
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use(express.json());

app.use("/api", router);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});

export default app;
