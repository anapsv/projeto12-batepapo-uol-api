import express from 'express';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import cors from 'cors';
import joi from 'joi';
import dayjs from 'dayjs';

const app = express();
app.use(express.json());
app.use(cors());
dotenv.config();

let db = null;
const mongoClient = new MongoClient(process.env.MONGO_URL);
const promise = mongoClient.connect();
promise.then(() => {
    db = mongoClient.db(process.env.DATABASE);
    console.log('Successfully connected to database');
});
promise.catch((err) => {
    console.log('There was an error connecting to database', err);
});

app.post('/participants', async (req, res) => {
    const participant = req.body;
    const participantSchema = joi.object({name: joi.string().required()});
    const { error } = participantSchema.validate(participant);
    if(error) {
        console.log(error);
        res.sendStatus(422);
        return;
    }

    try {
        const participantAlreadyExists = await db.collection('participants').findOne({name: participant.name});
        if(participantAlreadyExists){
            res.sendStatus(409);
            return;
        }
    await db.collection('participants').insertOne({name: participant.name, lastStatus: Date.now()});
    await db.collection('messages').insertOne(
        {from: participant.name,
         to: 'Todos',
         text: 'entra na sala...',
         type: 'status',
         time: dayjs().format('HH:mm:ss')
        });

    res.sendStatus(201);

    } catch (err) {
        res.send('Failed to register user', err);
        return;
    }
});

app.get('/participants', async (req, res) => {
    try {
        const participants = await db.collection('participants').find().toArray();
        res.send(participants);
    } catch (err) {
        res.send(err);
        return;
    }
});

app.post('/messages', async (req, res) => {
    const message = req.body;
    const messageSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required,
        type: joi.string().valid('message','private_message').required()
    });
    const { err } = messageSchema.validate(message, {abortEarly: false});
    if(err) {
        res.sendStatus(422);
        return;
    }

    const { user } = req.headers;
    try {
        const participant = await db.collection('participants').findOne({name: user});
        if(!participant){
            res.sendStatus(422);
            return;
        }
        
        await db.collection('messages').insertOne(
            {from: user,
             to: message.to,
             text: message.text,
             type: 'message',
             time: dayjs().format('HH:mm:ss')
            });
        res.sendStatus(201);
    } catch (error) {
        res.sendStatus(422);
        return;
        }

});

app.get('/messages', async (req, res) => {
    const limit = parseInt(req.query.limit);
    const { user } = req.headers;

    try {
        const messages = await db.collection('messages').find().toArray();
        const messagesFiltered = messages.filter(message => {
            const { from, to, type } = message;
            const messageToUser = to === 'Todos' || to === user || from === user;
            const isPublicMessage = type === 'message';
            return messageToUser || isPublicMessage;
        });
        
        if(limit && limit !== NaN){
            res.send(messagesFiltered.slice(-limit));
            return;
        }
        res.send(messagesFiltered);


    } catch (error) {
        res.sendStatus(404);
        return;
    }
});

app.post('/status', async (req, res) => {
    const { user } = req.headers;
    try {
        const participant = await db.collection('participants').findOne({name: user});
        if(!participant){
            res.sendStatus(404);
            return;
        }
        await db.collection('participants').updateOne({name: user}, {$set: {lastStatus: Date.now()} });
        res.sendStatus(200);

    } catch (error) {
        res.sendStatus(404);
    }

});

setInterval(async () => {
    const timeLimit = Date.now() - (10000);
    try {
        const inactiveUsers = await db.collection('participants').find({lastStatus: {$lte: timeLimit}}).toArray();
        if(inactiveUsers.length > 0){
            const isInactive = inactiveUsers.map(inactiveUser => {
                return {
                    from: inactiveUser.name,
                    to: 'Todos',
                    text: 'sai da sala...',
                    type: 'status',
                    time: dayjs().format('HH:mm:ss')
                }
            });
            await db.collection('messages').insertMany(isInactive);
            await db.collection('participants').deleteMany({lastStatus: {$lte: timeLimit}});
        }
    } catch (error) {
        
    }
}, 15000);

app.listen(parseInt(process.env.PORT), () => {
    console.log(`Server on port ${process.env.PORT}`)
});