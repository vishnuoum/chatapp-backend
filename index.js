const express = require("express");
require('dotenv').config();
const cors = require('cors');
const app = express();
app.use(cors())
app.use(express.json());
const http = require('http');
const server = http.createServer(app);
const db = require('./db');
const io = require('socket.io')(server, {
    cors: {
        origin: '*',
    }
});

const userSocketMap = {};

const saveMessageToDB = async (data) => {
    await db.query(`Insert into chats(text, sender_id, receiver_id, group_id, datetime)
        values(?, ?, ?, ?, ?)`,
        [data.text, data.sender_id, data.receiver_id, data.group_id, data.datetime]);
    console.log("Message saved to DB");

    if (!data.group_id) {
        await db.query(`Insert into chat_summary(user_id, chat_id, type, last_message, last_datetime)
        values
        (?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            last_message = VALUES(last_message),
            last_datetime = VALUES(last_datetime);`,
            [
                data.sender_id, data.receiver_id, "individual", data.text, data.datetime,
                data.receiver_id, data.sender_id, "individual", data.text, data.datetime
            ]);
    } else {
        await db.query(`Update chat_summary set last_message = ?, last_datetime = ? where type = 'group' and chat_id=?`,
            [data.text, data.datetime, data.group_id]
        )
    }


    console.log("Message saved to DB");
}


io.on('connection', socket => {
    console.log("user connected" + socket.id)
    socket.on('send', data => {

        data["datetime"] = new Date().toISOString();
        saveMessageToDB(data);
        if (data["receiver_id"]) {
            console.log("message at server");
            console.log(data)
            console.log(userSocketMap);
            console.log("emitting to socket: " + userSocketMap[String(data["receiver_id"])])
            socket.to(userSocketMap[String(data["receiver_id"])]).emit("receive", data)
        } if (data["group_id"]) {
            console.log(data)
            console.log(`emitting to group: group_${data["group_id"]}`)
            socket.to(`group_${data["group_id"]}`).emit("receive", data);
        }
    });
    socket.on('disconnect', () => { console.log("user disconnected") });

    socket.on("register", data => {
        console.log("User registering " + JSON.stringify(data))
        userSocketMap[data["user_id"]] = socket.id;
        const joinGroupOnConenct = async () => {
            try {
                const groups = await db.query(`Select group_id from group_members where user_id=?`, [data["user_id"]]);
                console.log("groups " + JSON.stringify(groups));
                groups.map(group => {
                    socket.join(`group_${group.group_id}`)
                    console.log(`User ${data["user_id"]} joined in group_${group.group_id}`)
                })
            } catch (err) {
                console.error(err);
            }

        }
        joinGroupOnConenct()
        console.log(userSocketMap)
    })

    socket.on("joinGroup", data => {
        socket.join(`group_${data.group_id}`)
        console.log(`User ${data.user_id} joined in group_${data.group_id}`)
    })
});

app.get("/", (req, res) => {
    res.send("Hi")
})

app.post("/login", async (req, res) => {
    console.log(req.body);
    requestBody = req.body;
    try {
        const rows = await db.query('SELECT phone FROM users where phone=? and password = SHA2(?, 256)',
            [requestBody.phone, requestBody.password]);
        if (rows.length !== 1) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB error: ' + err.sqlMessage });
    }
});

app.post("/signup", async (req, res) => {
    console.log(req.body);
    requestBody = req.body;
    try {
        const rows = await db.query('Insert into users(username, phone, password) values (?, ?, SHA2(?, 256))',
            [requestBody.username, requestBody.phone, requestBody.password]);
        res.json({ "phone": requestBody.phone });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB error: ' + err.code });
    }
});

app.post("/getUsername", async (req, res) => {
    console.log(req.body);
    requestBody = req.body;
    try {
        const rows = await db.query('Select username as title from users where phone = ?',
            [requestBody.phone]);
        console.log("get username: " + JSON.stringify(rows))
        if (rows.length !== 1) {
            return res.status(401).json({ error: 'Invalid userId' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB error: ' + err.code });
    }
});

app.post("/getGroupName", async (req, res) => {
    console.log("get group name", req.body);
    requestBody = req.body;
    try {
        const rows = await db.query('Select name as title from groups where id = ?',
            [requestBody.group_id]);
        if (rows.length !== 1) {
            return res.status(401).json({ error: 'Invalid groupId' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB error: ' + err.code });
    }
});

app.post("/getChatSummary", async (req, res) => {
    console.log(req.body);
    requestBody = req.body;
    try {
        const rows = await db.query(`
            SELECT 
                cs.chat_id, type, last_message, last_datetime, COALESCE(g.name, u.username) AS title 
            FROM chat_summary cs 
                LEFT JOIN groups g ON cs.chat_id = g.id AND cs.type = 'group' 
                LEFT JOIN users u ON cs.chat_id = u.phone AND cs.type = 'individual' 
            WHERE user_id = ?
            ORDER BY cs.last_datetime DESC;`,
            [requestBody.user_id]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'DB error: ' + err.code });
    }
});


app.post("/getMessages", async (req, res) => {
    console.log(req.body);
    requestBody = req.body;
    try {
        if (!requestBody.group_id) {
            const rows = await db.query(`
            SELECT 
                * 
            FROM chats 
            WHERE (sender_id = ? AND receiver_id = ?) 
            OR 
            (sender_id = ? AND receiver_id = ?)
            ORDER BY datetime DESC;`,
                [requestBody.user_id, requestBody.chat_id, requestBody.chat_id, requestBody.user_id]);
            res.json(rows);
        } else {
            const rows = await db.query(`
            SELECT 
                * 
            FROM chats 
            WHERE group_id=?
            ORDER BY datetime DESC;`,
                [requestBody.group_id]);
            res.json(rows);
        }

    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

app.post("/createGroup", async (req, res) => {
    console.log(req.body);
    requestBody = req.body;
    try {
        if (requestBody.members && requestBody.members.length > 0) {
            const rows = await db.query(`
                INSERT INTO groups(name, admin)
                VALUES(?, ?)`, [requestBody.name, requestBody.user_id]);

            const groupId = rows.insertId;
            console.log("created group with id", groupId)

            await db.query(`
                INSERT INTO group_members(group_id, user_id)
                VALUES
                ?`, [requestBody.members.map(member => [groupId, member])]);

            const now = new Date();
            await db.query(`
                INSERT INTO chat_summary(user_id, chat_id, type, last_message, last_datetime)
                VALUES ?`,
                [requestBody.members.map(member => [member, groupId, "group", "....", now])]);

            io.to(
                requestBody.members
                    .map(uid => userSocketMap[String(uid)])
                    .filter(Boolean)
            ).emit("group_created", {
                group_id: groupId,
                name: requestBody.name
            });

            return res.json({ "group_id": groupId })
        } else {
            console.log("no request for creaing group")
            res.sendStatus(500)
        }
    } catch (err) {
        console.error(err);
        res.sendStatus(500)
    }
})

server.listen(8000, () => console.log("Server started on port 8000"));