const express = require("express");
require('dotenv').config();
const app = express();
const http = require('http');
const server = http.createServer(app);
const db = require('./db');
const io = require('socket.io')(server, {
    cors: {
        origin: '*',
    }
});

const userSocketMap = {};


io.on('connection', socket => {
    console.log("user connected" + socket.id)
    socket.on('send', data => {
        console.log("message at server");
        socket.to(userSocketMap[data["receiverId"]]).emit("receive", data)
    });
    socket.on('disconnect', () => { console.log("user disconnected") });

    socket.on("register", data => {
        console.log("User registering " + JSON.stringify(data))
        userSocketMap[data["userId"]] = socket.id;
    })
});

app.get("/", async (req, res) => {
    try {
        const rows = await db.query('SELECT * FROM users');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB error' });
    }
});

server.listen(8000, () => console.log("Server started on port 8000"));