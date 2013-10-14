var connect = require('connect'),
    http = require('http'),
    socketio = require('socket.io'),
    fs = require('fs'),
    spades = require('./spades.js'),
    card = require('./public/card.js');

app = http.createServer(connect().use(connect.static('public')));
io = socketio.listen(app);

/*io.configure(function () { 
    io.set("transports", ["xhr-polling"]); 
    io.set("polling duration", 10); 
});*/

app.listen(process.env.PORT || 1337);

var Room = function (name) {
    this.name = name;
    this.players = {team0: {player0: null, player1: null},
                    team1: {player0: null, player1: null}};
    this.game = new spades.Game();
    this.gameInProgress = false;

    this.addPlayer = function (socket, team, player) {
        if (!this.players[team][player]) {
            this.players[team][player] = socket;
            return true;
        }
        return false;
    };

    this.sendMessage = function (message) {
        if (message.recipient == "all") {
            io.sockets.in(this.name).emit(message.action, message.data);
        } else if (message.recipient == "team0" || message.recipient == "team1") {
            this.players[message.recipient].player0.emit(message.action, message.data);
            this.players[message.recipient].player1.emit(message.action, message.data);
        } else {
            this.players[message.recipient.team][message.recipient.player].emit(message.action, message.data);
        }
    };

	this.numPlayers = function () {
		var total = 0;
		for (var team in this.players) {
			for (var player in this.players[team]) {
				if (this.players[team][player]) {
					total += 1;	
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
	rooms = {},
	nextRoom = 0;

var registerPlayerEvents = function (socket, room, team, player) {
    var teammate;

    if (player == "player0") {
        teammate = "player1";
    } else {
        teammate = "player0";
    }

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
        io.sockets.in(room.name).emit('msg', {name: "server", text: users[socket.id] + " wants to bid " + data});
        tmsocket.removeAllListeners("bidAccept");
        tmsocket.emit("bidAccept", bid);
        tmsocket.on("bidAccept", function (data) {
            if (data.accept) {
                var messages = room.game.bid(team, spades.bidType[bid]);
                io.sockets.in(room.name).emit('msg', {name: "server", text: users[tmsocket.id].name + " accepts."});
                io.sockets.in(room.name).emit('bidConfirmed', null);
                messages.forEach(room.sendMessage.bind(room));
            } else {
                io.sockets.in(room.name).emit('msg', {name: "server", text: users[tmsocket.id].name + " declines."});
            }
            socket.removeAllListeners("bidAccept");
            tmsocket.removeAllListeners("bidAccept");
        });
    });

    socket.on("play", function (data) {
        var messages = room.game.play(team, player, new card.Card(data.card));
        io.sockets.in(room.name).emit("play", {team: team, player: player, card: data.card});
        //setTimeout(function () {
            messages.forEach(room.sendMessage.bind(room));
        //}, 2000);
    });

    socket.on('msg', function (data) {
        socket.get('name', function (err, name) {
            socket.broadcast.to(room.name).emit('msg', {name: name, text: data.text});
        });
    });

    socket.on('leave', function (data) {
        room.players[team][player] = null;
        socket.broadcast.to(room.name).emit('leave', {team: team, player: player});
        socket.leave(room.name);
        socket.join('lobby');
		if (room.numPlayers() === 0) {
			delete rooms[room.name];
			sendRooms(io.sockets.in('lobby'));
		} else {
			sendRooms(socket);
		}
    });

    socket.on('disconnect', function (data) {
        room.players[team][player] = null;
        socket.broadcast.to(room.name).emit('leave', {team: team, player: player});
    });
};

var sendRooms = function (recipients) {
    recipients.emit('rooms', Object.keys(rooms).map(function (name) {
        var room = rooms[name],
            players = {};
        players[name + "-team0-player0"] = room.players.team0.player0 ? users[room.players.team0.player0.id] : null;
        players[name + "-team1-player0"] = room.players.team1.player0 ? users[room.players.team1.player0.id] : null;
        players[name + "-team0-player1"] = room.players.team0.player1 ? users[room.players.team0.player1.id] : null;
        players[name + "-team1-player1"] = room.players.team1.player1 ? users[room.players.team1.player1.id] : null;
        return {name: room.name, players: players};
    }));
};

io.sockets.on('connection', function (socket) {
    users[socket.id] = 'guest';
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
        io.sockets.in(room.name).emit('sit', {place: team + '-' + player, user: users[socket.id]});
        registerPlayerEvents(socket, room, team, player);
    };

    socket.on("addRoom", function (data) {
        var name = "room" + nextRoom++,
            room = new Room(name);
        rooms[name] = room;
        joinRoom(room, "team0", "player0");
        sendRooms(io.sockets.in('lobby'));
    });

    socket.on("joinRoom", function (data) {
        var room = rooms[data.name];
        if (!room.players[data.team][data.player]) {
            joinRoom(room, data.team, data.player);

            if (room.isFull() && !room.gameInProgress) {
                room.gameInProgress = true;
                room.sendMessage(room.game.reset());
            }
            sendRooms(io.sockets.in('lobby'));
        }
    });

    socket.on('disconnect', function (data) {
        delete users[socket.id];
    });
});
