
import cors from "cors";
import express from "express";
import "dotenv/config";
import router from "./router/router";
import { notFound, errorHandler } from "./errorHandler"; 

const PORT = 3000;

const app = express();

const corsOptions = {
  origin: "http://localhost:5173",
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ROUTES
app.use("/api", router);

// 404 handler - catches any routes that weren't matched
app.use(notFound);


// global error handler - catches any errors passed to next()
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});

export default app;
