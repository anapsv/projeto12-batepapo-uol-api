import express from 'express';
import dotenv from 'dotenv';

const app = express();
dotenv.config();

app.listen(parseInt(process.env.PORT), () => {
    console.log(`Server on port ${process.env.PORT}`)
});