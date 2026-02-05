import { Pool } from "pg";

// const pool = new Pool({ connectionString: process.env.PG_URI });


const pool = new Pool({
  host: process.env.DB_HOST ,
  port: Number(process.env.DB_PORT), 
  database: process.env.DB_NAME, 
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ,
});



export default {
  getTeams: async (_, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM "allTeams"');

      if (!result) {
        res.locals.dbResults = "No teams controller data";
        return next();
      }
      res.locals.dbResults = result.rows;



      return next();
    } catch (error) {
      const serverError = {
        log: `Error in Teams Controller middleware: ${error instanceof Error ? error.message : "Unknown error"}`,
        status: 500,
        message: {
          err: "Failed to correctly retrieve the database  query for Teams Controls",
        },
      };
      return next(serverError);
    }
  },
};
