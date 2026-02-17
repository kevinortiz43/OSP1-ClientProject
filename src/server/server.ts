
import cors from "cors";
import express from "express";
import "dotenv/config";
import router from "./router/router";
import { notFound, errorHandler } from "./errorHandler"; 

const PORT = 3000;

// initialize express
const app = express();

// add middleware (CORS middleware MUST come first before router api)
const corsOptions = {
  origin: "http://localhost:5173",
  optionsSuccessStatus: 200,
};

// add cors
app.use(cors(corsOptions));

// parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // if we have forms

// ROUTES
app.use("/api", router);

// 404 handler - catches any routes that weren't matched
// If request reaches here, no route handled it
app.use(notFound);


// Global error handler - catches any errors passed to next()
// Must be LAST
app.use(errorHandler);


/* start server */
app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});

export default app;
