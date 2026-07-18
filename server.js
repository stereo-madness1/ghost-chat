const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => {
        const room = io.sockets.adapter.rooms.get(roomId);
        const numClients = room ? room.size : 0;

        if (numClients === 0) {
            socket.join(roomId);
            socket.emit('created', roomId);
        } else if (numClients === 1) {
            socket.join(roomId);
            socket.emit('joined', roomId);
            socket.to(roomId).emit('ready');
        } else {
            socket.emit('full', roomId);
        }
    });

    socket.on('signal', (data) => {
        socket.to(data.roomId).emit('signal', data.signal);
    });

    socket.on('disconnecting', () => {
        for (const room of socket.rooms) {
            if (room !== socket.id) {
                socket.to(room).emit('peer-disconnected');
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Signaling infrastructure running on port ${PORT}`));
