var assert = require('assert'),
    io = require('socket.io-client'),
    spades = require('./spades.js'),
    card = require('./public/card.js');

describe("Bid:", function () {
    var bid;

    beforeEach(function (done) {
        bid = new spades.Bid();
        done();
    });

    describe("constructor", function () {
        it("should set blind to true.", function (done) {
            assert.equal(bid.blind(), true);
            done();
        });
    });

    describe("getters and setters", function () {
        it("should work.", function (done){
            bid.setBlind(false);
            assert.equal(bid.blind(), false);
            bid.setMult(2);
            assert.equal(bid.mult(), 2);
            bid.setVal(10);
            assert.equal(bid.val(), 10);
            done();
        });
    });

    describe("_points method", function () {
        it("should return the correct points.", function (done) {
            assert.equal(bid._points(false, 4, 1), 40);
            assert.equal(bid._points(true, 4, 1), 80);
            assert.equal(bid._points(true, 10, 2), 400);
            done();
        });
    });

    describe("isComplete method", function () {
        it("should return false before mult and val are set", function (done) {
            assert.equal(bid.isComplete(), false);
            done();
        });

        it("should return true after mult and val are set", function (done) {
            bid.setMult(1);
            bid.setVal(4);
            assert.equal(bid.isComplete(), true);
            done();
        });
    });
});

describe("TeamData:", function () {
    var tinfo;

    beforeEach(function (done) {
        tinfo = new spades.TeamData();
        done();
    });

    describe("constructor", function () {
        it("should set players' cards and team's books to empty arrays", function (done) {
            assert.deepEqual(tinfo.cards("player0"), []);
            assert.deepEqual(tinfo.cards("player1"), []);
            assert.deepEqual(tinfo.books(), []);
            done();
        });

        it("should set bid to an empy bid object.", function (done) {
            assert.ok(tinfo.bid().equals(new spades.Bid()));
            done();
        });
    });

    describe("getters and setters", function () {
        it("should work", function (done) {
            // cards
            var cards = [card.Card(0), card.Card(1)];
            tinfo.setCards('player0', cards);
            assert.deepEqual(tinfo.cards('player0'), cards);
            // bid
            assert.ok(tinfo.bid().equals(new spades.Bid()));
            // books
            assert.deepEqual(tinfo.books(), []);
            tinfo.addBook({});
            assert.deepEqual(tinfo.books(), [{}]);
            assert.equal(tinfo.numBooks(), 1);
            done();
        });
    });

    describe("bidComplete method", function () {
        it("should return true only after the bid's values are set", function (done) {
            assert.equal(tinfo.bidComplete(), false);
            tinfo.bid().setMult(2);
            tinfo.bid().setVal(10);
            assert.ok(tinfo.bidComplete());
            done();
        });
    });

    describe("numBooks method", function () {
        it("should return the correct number of books.", function (done) {
            assert.equal(tinfo.numBooks(), 0);
            tinfo.addBook("dummy");
            assert.equal(tinfo.numBooks(), 1);
            done();
        });
    });

    describe("_points", function () {
        it("should return the correct points.", function (done) {
            var bid = new spades.Bid();
            bid.setBlind(false);
            bid.setMult(1);
            bid.setVal(4);
            assert.equal(tinfo._points(bid, 0), -40);
            assert.equal(tinfo._points(bid, 4), 40);
            assert.equal(tinfo._points(bid, 7), -40);
            done();
        });
    });

    describe("", function () {
        it("", function (done) {
            done();
        });
    });
});

describe("RoundData: ", function () {
    var round,
        startingPlayer = {team: 'team0',
            player: 'player0'
        },
        cf = new spades.CardFactory(),
        threeOfHearts = cf.getCard("3", "heart"),
        fourOfHearts = cf.getCard("4", "heart"),
        fiveOfHearts = cf.getCard("5", "heart"),
        sixOfHearts = cf.getCard("6", "heart"),
        sevenOfClubs = cf.getCard("7", "club"),
        twoOfSpades = cf.getCard("2", "spades"),
        big = cf.getCard("B");


    beforeEach(function (done) {
        round = new spades.RoundData(startingPlayer);
        done();
    });

    describe("constructor", function () {
        it("should initialize the turn to 1.", function (done) {
            assert.equal(round.turn(), 1);
            done();
        });

        it("should initialize spades played to false.", function (done) {
            assert.equal(round.spadesPlayed(), false);
            done();
        });

        it("should initialize currBook to an empty list.", function(done) {
            assert.deepEqual(round.currBook(), []);
            done();
        });
    });

    describe("getters and setters", function () {
        it("should work", function (done) {
            // turn
            assert.equal(round.turn(), 1);
            round.incrementTurn();
            assert.equal(round.turn(), 2);
            // spadesPlayed
            assert.equal(round.spadesPlayed(), false);
            round.setSpadesPlayed(true);
            assert.equal(round.spadesPlayed(), true);
            // current book
            assert.equal(round.currBook().length, 0);
            // currBookWinner
            assert.equal(round.currBookWinner(), undefined);
            // books and numBooks
            assert.equal(round.numBooks('team0'), 0);
            round.addBook('team0', {});
            assert.equal(round.numBooks('team0'), 1);
            // bid
            assert.ok(round.bid("team0").equals(new spades.Bid()));
            // currPlayer
            assert.deepEqual(round.currPlayer(), startingPlayer);
            // cards
            assert.equal(round.cards('team0', 'player0').length, 13);
            assert.equal(round.cards('team0', 'player1').length, 13);
            assert.equal(round.cards('team1', 'player0').length, 13);
            assert.equal(round.cards('team1', 'player1').length, 13);
            done();
        });
    });

    describe("deal method", function () {
        it("should assign each player 13 cards.", function (done) {
            round.deal();
            assert.equal(round.cards('team0', 'player0').length, 13);
            assert.equal(round.cards('team0', 'player1').length, 13);
            assert.equal(round.cards('team1', 'player0').length, 13);
            assert.equal(round.cards('team1', 'player1').length, 13);
            done();
        });
    });

    describe("_playableCards method", function () {
        it("should return all cards except spades when player is first unless spades have been played or player only has spades", function (done) {
            var cards = [threeOfHearts, fourOfHearts, sevenOfClubs, twoOfSpades],
                book = [];
            assert.equal(round._playableCards(cards, book, false).length, 3);
            assert.equal(round._playableCards(cards, book, true).length, 4);
            cards = [twoOfSpades, big];
            assert.equal(round._playableCards(cards, book, false).length, 2);
            assert.equal(round._playableCards(cards, book, true).length, 2);
            done();
        });

        // TODO: test other conditions
    });

    describe("_bookWinner method", function () {
        var cf = new spades.CardFactory(),
            threeOfHearts = {card: cf.getCard("3", "heart")},
            fourOfHearts = {card: cf.getCard("4", "heart")},
            fiveOfHearts = {card: cf.getCard("5", "heart")},
            sixOfHearts = {card: cf.getCard("6", "heart")},
            sevenOfClubs = {card: cf.getCard("7", "club")},
            twoOfSpades = {card: cf.getCard("2", "spades")},
            big = {card: cf.getCard("B")};


        it("should return the highest card played if all same suit", function (done) {
            var first = threeOfHearts,
                others = [fourOfHearts, fiveOfHearts, sixOfHearts];
            assert.equal(round._currBookWinnerHelper(first, others), sixOfHearts);
            done();
        });

        // TODO: test other conditions
    });

    describe("", function () {
        it("", function (done) {
            done();
        });
    });
});

describe("GameData", function () {
    var game;

    beforeEach(function (done) {
        game = new spades.GameData();
        done();
    });

    describe("constructor", function () {
        it("should initialize team scores to 0.", function (done) {
            assert.equal(game.score("team0"), 0);
            assert.equal(game.score("team1"), 0);
            done();
        });
    });

    describe("getters and setters", function () {
        it("should work.", function (done) {
            // bid
            assert.ok(game.bid("team0").equals(new spades.Bid()));
            // currPlayer
            assert.deepEqual(game.currPlayer(), {team: 'team1', player: 'player0'});
            done();
        });
    });
});
