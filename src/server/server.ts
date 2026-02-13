// import path from "path";
import cors from "cors";
import express, { Request, Response, NextFunction } from "express";
// import dotenv from "dotenv";
import "dotenv/config";
import router from "./router/router";


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


app.use(express.json());

app.use("/api", router);

// parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // if we have forms



/* start server */
app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});

export default app;
