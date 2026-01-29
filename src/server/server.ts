// import path from "path";
import cors from "cors";
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import db from "./sql_db/db_connect"

dotenv.config(); // process.env


const PORT = 3000;


// initialize express
const app = express();


// add middleware
const corsOptions = {
  origin: "http://localhost:5173",
  optionsSuccessStatus: 200,
};

// add cors
app.use(cors(corsOptions))

// parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // if we have forms


// add routes




// test db route simple
app.get("/api/test-simple", async (req: Request, res: Response) => {
  try {
    // should work even when db is empty, just get current time
    const result = await db.query("SELECT NOW() as current_time");
    
    res.status(200).json({
      success: true,
      message: "Connected to database",
      current_time: result.rows[0].current_time
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});



/* start server */
app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});

export default app;


