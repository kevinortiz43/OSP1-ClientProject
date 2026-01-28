import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db_connect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // current working directory (where this file located)
const dataDir = path.join(__dirname, '../data'); // path for /data folder

// NOTE: run this script to seed database after creating csv files in /data folder

// check to make sure csv files exist in /data folder
 
// extract csv filename to create table name

// iterate over existing csv files to find fields and check field types

// check if field is null or empty

// set conditions to determine field types for SQL schema and creation
// if key is id, then have type as PRIMARY KEY 
// if value type is string, then VARCHAR(255)
// if value is date type, then TIMESTAMPTZ
// if value type is number and not float, then INT
// if value type is number and float, then NUMERIC(10, 2)
// etc.



// SQL command for creating table
// only create table if does not already exist

// create fields, according to csv fields
// create field types, according to csv field types





// seed database by reading csv files and inserting data





