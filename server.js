var connect = require('connect'),
    http = require('http'),
    socketio = require('socket.io'),
    fs = require('fs'),
    spades = require('./spades.js'),
    card = require('./public/card.js');

app = http.createServer(connect().use(connect.static('public')));
io = socketio.listen(app);

io.configure(function () {
    io.set("transports", ["websocket"]);
});

app.listen(process.env.PORT || 1337);

var Room = function (name) {
    this.name = name;
    this.players = {team0: {player0: null, player1: null},
                    team1: {player0: null, player1: null}};
    this.gameInProgress = false;

    this.addPlayer = function (socket, team, player) {
        if (!this.players[team][player]) {
            this.players[team][player] = socket;
            return true;
        }
        return false;
    };

    this.emit = function (msg, data) {
        io.sockets.in(this.name).emit(msg, data);
    };

    this.sendToAll = function (action, data) {
        this.emit(action, data);
    };

    this.sendToTeam = function (team, action, data) {
        this.sendToPlayer(team, 'player0', action, data);
        this.sendToPlayer(team, 'player1', action, data);
    };

    this.sendToPlayer = function (team, player, action, data) {
        console.log(team);
        console.log(player);
        console.log(action);
        console.log(data);
        this.players[team][player].emit(action, data);
    };

    this.sendCards = function (team, player) {
        this.game.sendCards(team, player);
    };

    this.game = new spades.GameInterface({sendToAll: this.sendToAll.bind(this),
            sendToTeam: this.sendToTeam.bind(this),
            sendToPlayer: this.sendToPlayer.bind(this)
        });

    this.numPlayers = function () {
        var total = 0;
        for (var team in this.players) {
            for (var player in this.players[team]) {
                if (this.players[team][player]) {
                    total++;
                }
            }
        }
        return total;
    };
    
    this.isFull = function () {
        return this.numPlayers() == 4;
    };
};

var users = {},
    nextUser = 0,
    rooms = {},
    nextRoom = 0;

var registerPlayerEvents = function (socket, room, team, player) {
    var teammate = (player == "player0") ? "player1" : "player0";

    for (var tkey in room.players) {
        for (var pkey in room.players[team]) {
            if (room.players[tkey][pkey]) {
                socket.emit("sit", {user: users[room.players[tkey][pkey].id],
                    place: tkey + "-" + pkey});
            }
        }
    }

    socket.on("bid", function (data) {
        var bid = data,
            tmsocket = room.players[team][teammate];
        room.emit('msg', {name: "server",
            text: users[socket.id] + " wants to bid " + data});
        tmsocket.removeAllListeners("bidAccept");
        tmsocket.emit("bidAccept", bid);
        tmsocket.on("bidAccept", function (data) {
            if (data.accept) {
                room.emit('bidConfirmed', null);
                room.game.bid(team, spades.bidType[bid]);
                room.emit('msg', {name: "server",
                    text: users[tmsocket.id].name + " accepts."});
            } else {
                room.emit('msg', {name: "server",
                    text: users[tmsocket.id].name + " declines."});
            }
            socket.removeAllListeners("bidAccept");
            tmsocket.removeAllListeners("bidAccept");
        });
    });

    socket.on("play", function (data) {
        room.emit("play", {team: team, player: player, card: data.card});
        room.game.play(team, player, new card.Card(data.card));
    });

    socket.on('msg', function (data) {
        socket.get('name', function (err, name) {
            socket.broadcast.to(room.name).emit('msg',
                {name: name, text: data.text});
        });
    });

    var cleanupOnLeave = function () {
        room.players[team][player] = null;
        socket.leave(room.name);
        room.emit('leave', {team: team, player: player});
        socket.removeAllListeners('bid');
        socket.removeAllListeners('play');
        socket.removeAllListeners('msg');
        socket.removeAllListeners('leave');
        socket.removeListener('disconnect', cleanupOnLeave);
        if (room.numPlayers() === 0) {
            delete rooms[room.name];
            sendRooms(io.sockets.in('lobby'));
        } else {
            sendRooms(socket);
        }
    };

    socket.on('leave', function (data) {
        cleanupOnLeave();
        socket.join('lobby');
    });

    socket.on('disconnect', cleanupOnLeave);
};

var sendRooms = function (recipients) {
    recipients.emit('rooms', Object.keys(rooms).map(function (name) {
        var room = rooms[name],
            players = {},
            team0 = room.players.team0,
            team1 = room.players.team1;
        var playerName = function (player) {
            if (player) {
                return users[player.id];
            }
            return null;
        };
        players[name + "-team0-player0"] = playerName(team0.player0);
        players[name + "-team1-player0"] = playerName(team1.player0);
        players[name + "-team0-player1"] = playerName(team0.player1);
        players[name + "-team1-player1"] = playerName(team1.player1);
        return {name: room.name, players: players};
    }));
};

io.sockets.on('connection', function (socket) {
    users[socket.id] = 'guest' + nextUser++;
    socket.set('name', 'guest');
    socket.join('lobby');
    sendRooms(socket);

    socket.on("setName", function (data) {
        if (data != "server") {
            users[socket.id] = data || users[socket.id];
            socket.get('name', function (err, name) {
                socket.set('name', data || name);
            });
        }
    });

    var joinRoom = function (room, team, player) {
        socket.join(room.name);
        socket.leave('lobby');
        room.players[team][player] = socket;
        room.emit('sit', {place: team + '-' + player, user: users[socket.id]});
        registerPlayerEvents(socket, room, team, player);
    };

    socket.on("addRoom", function (data) {
        // TODO: Merge this functionality with room.addPlayer
        var name = "room" + nextRoom++,
            room = new Room(name);
        rooms[name] = room;
        joinRoom(room, "team0", "player0");
        sendRooms(io.sockets.in('lobby'));
    });

    socket.on("joinRoom", function (data) {
        // TODO: Merge this functionality with room.addPlayer
        var room = rooms[data.name];
        if (!room.players[data.team][data.player]) {
            joinRoom(room, data.team, data.player);

            if (room.isFull()) {
                if (!room.gameInProgress) {
                    room.gameInProgress = true;
                    room.game.reset();
                } else {
                    if (room.game.bidIn(data.team)) {
                        room.sendCards(data.team, data.player);
                        if (room.game.currPlayer.team == data.team && room.game.currPlayer.player == data.player) {
                                room.game.promptPlay();
                        }
                    } else if (room.game.currTeam == data.team) {
                        room.game.promptBid();
                    }
                }
            }
            sendRooms(io.sockets.in('lobby'));
        }
    });

    socket.on('disconnect', function (data) {
        delete users[socket.id];
    });
});
