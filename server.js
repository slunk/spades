var connect = require('connect')
    , http = require('http')
    , socketio = require('socket.io')
    , fs = require('fs')
    , spades = require('./spades.js')
    , card = require('./public/card.js');

app = http.createServer(connect().use(connect.static('public')));
io = socketio.listen(app);

io.configure(function () { 
    io.set("transports", ["xhr-polling"]); 
    io.set("polling duration", 10); 
});

app.listen(process.env.PORT || 1337);

var users = {}
    , players = {team0: {}, team1: {}}
    , game = new spades.Game();

var addPlayer = function (socket, team, player) {
    if (!players[team][player]) {
        users[socket.id].team = team;
        users[socket.id].player = player;
        players[team][player] = socket;
        return true;
    }
    return false;
};

var updateAll = function (action, data) {
    for (var sockid in users) {
        users[sockid].socket.emit(action, data);
    }
};

var username = function (socket) {
    return users[socket.id].name;
};

var sendMessage = function (message) {
    if (message.recipient == "all") {
        if (message.action = spades.SERVER_ACTION.SEND_SCORES) {
            console.log(message.data);
        }
        updateAll(message.action, message.data);
    } else if (message.recipient == "team0" || message.recipient == "team1") {
        players[message.recipient].player0.emit(message.action, message.data);
        players[message.recipient].player1.emit(message.action, message.data);
    } else {
        players[message.recipient.team][message.recipient.player].emit(message.action, message.data);
    }
};

io.sockets.on('connection', function (socket) {
    users[socket.id] = {socket: socket, name: "guest"};

    for (var team in players) {
        for (var player in players[team]) {
            if (players[team][player]) {
                socket.emit("sit", {user: username(players[team][player])
                    , place: team + "-" + player});
            }
        }
    }

    socket.on("setName", function (data) {
        if (data != "server") {
            users[socket.id].name = data || users[socket.id].name;
        }
    });

    socket.on("sit", function (data) {
        if (addPlayer(socket, data.team, data.player)) {
            console.log("SITTING");
            updateAll("sit", {user: username(socket), place: data.team + "-" + data.player});
            if (players["team0"]["player0"] && players["team0"]["player1"] &&
                players["team1"]["player0"] && players["team1"]["player1"]) {
                sendMessage(game.reset());
            }
        }
    });

    socket.on("bid", function (data) {
        var team = users[socket.id].team
            , player = users[socket.id].player
            , bid = data
            , tmsocket = players[team][teammate(player)];
        updateAll('msg', {name: "server", text: users[socket.id].name + " wants to bid " + data});
        tmsocket.emit("bidAccept", bid);
        tmsocket.on("bidAccept", function (data) {
            if (data.accept) {
                updateAll('msg', {name: "server", text: users[tmsocket.id].name + " accepts."});
                var messages = game.bid(team, spades.bidActions[bid]);
                messages.forEach(sendMessage);
                tmsocket.removeAllListeners("bidAccept");
            } else {
                updateAll('msg', {name: "server", text: users[tmsocket.id].name + " declines."});
                tmsocket.removeAllListeners("bidAccept");
            }
        });
    });

    socket.on("play", function (data) {
        var team = users[socket.id].team
            , player = users[socket.id].player
            , messages = game.play(team, player, new card.Card(data.card));
        console.log(data.card);
        updateAll("play", {team: team, player: player, card: data.card});
        messages.forEach(sendMessage);
    });

    socket.on("reset", function (data) {
        sendMessage(game.reset());
    });

    /* Disconnect cleanup */
    socket.on('disconnect', function (data) {
        if (users[socket.id].team) {
            var team = users[socket.id].team
                , player = users[socket.id].player;
            players[team][player] = null;
            updateAll('leave', {team: team, player: player});
        }
        delete users[socket.id];
    });

    /* Chat */
    socket.on('msg', function (data) {
        updateAll('msg', {name: username(socket), text: data.text});
    });
});

var teammate = function (player) {
    if (player == "player0") {
        return "player1";
    }
    return "player0";
};
