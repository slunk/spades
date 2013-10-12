var assert = require('assert')
    , io = require('socket.io-client')
    , spades = require('./spades.js')
    , card = require('./public/card.js');

describe("Model's", function () {
    var game;

    beforeEach(function (done) {
        game = new spades.Game();
        game.reset();
        done();
    });

    describe("reset method", function () {
        it("should set both teams' scores to 0", function (done) {
            assert.equal(game.team0.score, 0);
            assert.equal(game.team1.score, 0);
            done();
        });
        it("should deal each team 13 cards", function (done) {
            assert.equal(game.team0.player0.cards.length, 13)
            assert.equal(game.team0.player1.cards.length, 13)
            assert.equal(game.team1.player0.cards.length, 13)
            assert.equal(game.team1.player1.cards.length, 13)
            done();
        });
        it("should initialize the current round's state", function (done) {
            assert.equal(game.roundInfo.turn, 1);
            assert.deepEqual(game.roundInfo.currBook, []);
            assert.deepEqual(game.roundInfo.team0.books, []);
            assert.deepEqual(game.roundInfo.team0.bid, {blind: true});
            assert.deepEqual(game.roundInfo.team1.books, []);
            assert.deepEqual(game.roundInfo.team1.bid, {blind: true});
            assert.equal(game.roundInfo.team0.bid.blind, true);
            done();
        });
        it("should set up the current player and current team", function (done) {
            assert.deepEqual(game.currPlayer, {team: "team1", player: "player0"});
            assert.equal(game.currTeam, "team0");
            done();
        });
    });

    describe("bid method", function (done) {
        var actions;

        it("should return 3 actions and set blind to false when a team wants to show cards", function (done) {
            actions = game.bid("team0", spades.bidType["show-cards"]);
            assert.equal(actions.length, 3);
            assert.equal(actions[0].action, spades.SERVER_ACTION.SEND_CARDS);
            assert.deepEqual(actions[0].recipient, {team: "team0", player: "player0"});
            assert.equal(actions[1].action, spades.SERVER_ACTION.SEND_CARDS);
            assert.deepEqual(actions[1].recipient, {team: "team0", player: "player1"});
            assert.equal(actions[2].action, spades.SERVER_ACTION.PROMPT_BID);
            assert.equal(actions[2].recipient, "team0");
            assert.equal(game.roundInfo.team0.bid.blind, false);
            done();
        });

        it("should return 1 action and store bid information when a team bids after seeing their cards", function (done) {
            actions = game.bid("team0", spades.bidType["show-cards"]);
            actions = game.bid("team0", spades.bidType["board"]);
            assert.equal(actions.length, 1);
            assert.equal(actions[0].action, spades.SERVER_ACTION.PROMPT_BID);
            assert.equal(actions[0].recipient, "team1");
            assert.equal(game.roundInfo.team0.bid.val, 4);
            assert.equal(game.roundInfo.team0.bid.mult, 1);
            done();
        });

        it("should return 3 actions and store bid information if a team bids blind", function (done) {
            actions = game.bid("team0", spades.bidType["show-cards"]);
            actions = game.bid("team0", spades.bidType["board"]);
            actions = game.bid("team1", spades.bidType["2-for-10"]);
            assert.equal(actions.length, 3);
            assert.equal(actions[0].action, spades.SERVER_ACTION.SEND_CARDS)
            assert.deepEqual(actions[0].recipient, {team: "team1", player: "player0"});
            assert.equal(actions[2].action, spades.SERVER_ACTION.PROMPT_PLAY);
            assert.equal(actions[2].recipient, game.currPlayer);
            assert.deepEqual(actions[2].recipient, {team: "team1", player: "player0"});
            done();
        });
    });

    describe("determineWinner method", function (done) {
        var make_book = function (a, b, c, d) {
            return [
                {card: new card.Card(a)},
                {card: new card.Card(b)},
                {card: new card.Card(c)},
                {card: new card.Card(d)}
            ];
        };

        var check_winner = function (book, gold_winner) {
            assert.equal(game.determineWinner(book).card.id, gold_winner);
        };

        it("should pick the highest card played", function (done) {
            check_winner(make_book(12, 11, 10, 9), 12);
            done();
        });
        it("should make the suit of the first card trump other suites except spades", function (done) {
            check_winner(make_book(12, 13, 10, 9), 12);
            check_winner(make_book(4, 13, 11, 10), 11);
            done();
        });
        it("should make spades trump all other suits", function (done) {
            check_winner(make_book(12, 50, 11, 10), 50);
            check_winner(make_book(50, 49, 11, 10), 50);
            done();
        });
    });

    describe("scores", function (done) {
        it("should update correctly", function (done) {
            game.roundInfo.team0.books = {length: 4};
            game.roundInfo.team0.bid.val = 4;
            game.roundInfo.team0.bid.mult = 1;
            game.roundInfo.team0.bid.blind = false;
            game.roundInfo.team1.books = {length: 9};
            game.roundInfo.team1.bid.val = 10;
            game.roundInfo.team1.bid.mult = 2;
            game.roundInfo.team1.bid.blind = true;
            game.updateScores();
            assert.equal(game.team0.score, 40);
            assert.equal(game.team1.score, -400);
            game.team0.score = 0;
            game.team1.score = 0;
            game.roundInfo.team0.books = {length: 7};
            game.roundInfo.team0.bid.val = 4;
            game.roundInfo.team0.bid.mult = 1;
            game.roundInfo.team0.bid.blind = true;
            game.roundInfo.team1.books = {length: 6};
            game.roundInfo.team1.bid.val = 7;
            game.roundInfo.team1.bid.mult = 1;
            game.roundInfo.team1.bid.blind = false;
            game.updateScores();
            assert.equal(game.team0.score, -80);
            assert.equal(game.team1.score, -70);
            done();
        });
    });

    describe("playableCards", function (done) {
        beforeEach(function (done) {
            game.team0.player0.cards = [new card.Card(0)
                , new card.Card(1)
                , new card.Card(2)
                , new card.Card(44)
                , new card.Card(45)
            ]
            done();
        });

        it("should return a player's entire hand without spades if they are the first to play and spades have not been played", function (done) {
            var playable = game.playableCards("team0", "player0");
            assert.equal(playable.length, 3);
            for (var i = 0; i < playable.length; i++) {
                assert.notEqual(playable[i].suit(), "spade");
            }
            done();
        });

        it("should return a player's entire hand if they are the first to play and spades have been played", function (done) {
            var playable = null;
            game.roundInfo.spadesPlayed = true;
            playable = game.playableCards("team0", "player0");
            assert.equal(playable.length, 5);
            done();
        });

        it("should return a player's entire hand if they are the first to play and only have spades", function (done) {
            var playable = null;
            game.team0.player0.cards = game.team0.player0.cards.filter(function (card) {
                return card.suit() == "spade";
            });
            playable = game.playableCards("team0", "player0");
            assert.equal(playable.length, 2);
            for (var i = 0; i < playable.length; i++) {
                assert.equal(playable[i].suit(), "spade");
            }
            done();
        });

        it("should return cards of the first suit played if available", function (done) {
            var playable = null;
            game.roundInfo.currBook = [{card: new card.Card(4)}];
            playable = game.playableCards("team0", "player0");
            assert.equal(playable.length, 3);
            for (var i = 0; i < playable.length; i++) {
                assert.equal(playable[i].suit(), "heart");
            }
            done();
        });

        it("should return a player's entire hand if they are out of the first suit played available", function (done) {
            var playable = null;
            game.roundInfo.currBook = [{card: new card.Card(20)}];
            playable = game.playableCards("team0", "player0");
            assert.equal(playable.length, 5);
            done();
        });
    });

    describe("game", function (done) {
        it("should respond correctly to first four plays", function (done) {
            game.bid("team0", spades.bidType["board"]);
            game.bid("team1", spades.bidType["8"]);
            var actions = game.play("team1", "player0", game.team1.player0.cards[0]);
            assert.equal(actions.length, 1);
            assert.equal(actions[0].action, spades.SERVER_ACTION.PROMPT_PLAY);
            assert.deepEqual(actions[0].recipient, {team: "team0", player: "player1"});
            actions = game.play("team0", "player1", game.team0.player1.cards[0]);
            actions = game.play("team1", "player1", game.team1.player1.cards[0]);
            actions = game.play("team0", "player0", game.team0.player0.cards[0]);
            assert.equal(game.roundInfo.team0.books.length + game.roundInfo.team1.books.length, 1);
            assert.equal(game.roundInfo.turn, 2);
            done();
        });
    });
});

/*describe("Server", function(done) {
    var server = require('./server.js')
        , url = "http://localhost:1337"
        , socket1 = io.connect(url)
        , socket2 = io.connect(url)
        , socket3 = io.connect(url)
        , socket4 = io.connect(url);

    it("should notify a user when they join a team.", function (done) {
        socket1.on("sit", function (data) {
            socket1.removeAllListeners("sit");
            done();
        });
        socket1.emit("sit", {team: "team0", player: "player0"});
    });

    it("should notify other users when one joins a team.", function (done) {
        socket1.on("sit", function (data) {
            socket1.removeAllListeners("sit");
            done();
        });
        socket2.emit("sit", {team: "team0", player: "player1"});
    });
});*/
