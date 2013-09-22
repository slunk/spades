var assert = require('assert');
var spades = require('./spades.js');
var card = require('./public/card.js');

var run_all_tests = function () {
    test_init_game();
    test_bidding();
    test_book_winning();
    test_score_updating();
    test_card_playing();
};

var test_init_game = function () {
    var game = make_initialized_game();
    assert.equal(game.team0.score, 0);
    assert.equal(game.team1.score, 0);
    assert.equal(game.team0.player0.cards.length, 13)
    assert.equal(game.team0.player1.cards.length, 13)
    assert.equal(game.team1.player0.cards.length, 13)
    assert.equal(game.team1.player1.cards.length, 13)
    assert.equal(game.roundInfo.turn, 1);
    assert.deepEqual(game.roundInfo.currBook, []);
    assert.deepEqual(game.roundInfo.team0.books, []);
    assert.deepEqual(game.roundInfo.team0.bid, {blind: true});
    assert.deepEqual(game.roundInfo.team1.books, []);
    assert.deepEqual(game.roundInfo.team1.bid, {blind: true});
    assert.deepEqual(game.currPlayer, {team: "team1", player: "player0"});
    assert.equal(game.currTeam, "team0");
    console.log("test_init_game passed!");
};

var test_bidding = function () {
    var game = make_initialized_game();
    assert.equal(game.roundInfo.team0.bid.blind, true);
    var actions = game.bid("team0", spades.bidActions["show cards"]);
    assert.equal(actions.length, 3);
    assert.equal(actions[0].action, spades.SERVER_ACTION.SEND_CARDS);
    assert.deepEqual(actions[0].recipient, {team: "team0", player: "player0"});
    assert.equal(actions[2].action, spades.SERVER_ACTION.PROMPT_BID);
    assert.equal(actions[2].recipient, "team0");
    assert.equal(game.roundInfo.team0.bid.blind, false);
    actions = game.bid("team0", spades.bidActions["board"]);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].action, spades.SERVER_ACTION.PROMPT_BID);
    assert.equal(actions[0].recipient, "team1");
    assert.equal(game.roundInfo.team0.bid.val, 4);
    assert.equal(game.roundInfo.team0.bid.mult, 1);
    actions = game.bid("team1", spades.bidActions["2-for-10"]);
    assert.equal(actions.length, 3);
    assert.equal(actions[0].action, spades.SERVER_ACTION.SEND_CARDS)
    assert.deepEqual(actions[0].recipient, {team: "team1", player: "player0"});
    assert.equal(actions[2].action, spades.SERVER_ACTION.PROMPT_PLAY);
    assert.equal(actions[2].recipient, game.currPlayer);
    assert.deepEqual(actions[2].recipient, {team: "team1", player: "player0"});
    console.log("test_bidding passed!");
};

var test_book_winning = function () {
    var make_book = function (a, b, c, d) {
        return [
            {card: new card.Card(a)},
            {card: new card.Card(b)},
            {card: new card.Card(c)},
            {card: new card.Card(d)}
        ];
    };
    var determineWinner = make_initialized_game().determineWinner;
    var check_winner = function (book, gold_winner) {
        assert.equal(determineWinner(book).card.id, gold_winner);
    };
    check_winner(make_book(12, 11, 10, 9), 12);
    check_winner(make_book(12, 13, 10, 9), 12);
    check_winner(make_book(12, 50, 11, 10), 50);
    check_winner(make_book(50, 49, 11, 10), 50);
    check_winner(make_book(4, 13, 11, 10), 11);
    console.log("test_book_winning passed!");
};

var test_score_updating = function () {
    var game = make_initialized_game();
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
    console.log("test_score_updating passed!");
};

var test_card_playing = function () {
    var game = make_initialized_game();
    game.bid("team0", spades.bidActions["board"]);
    game.bid("team1", spades.bidActions["8"]);
    //var actions = game.play("team0", "player0", game.team0.player0.cards[0]);
    //assert.deepEqual(actions, []);
    var actions = game.play("team1", "player0", game.team1.player0.cards[0]);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].action, spades.SERVER_ACTION.PROMPT_PLAY);
    assert.deepEqual(actions[0].player, {team: "team0", player: "player1"});
    actions = game.play("team0", "player1", game.team0.player1.cards[0]);
    actions = game.play("team1", "player1", game.team1.player1.cards[0]);
    actions = game.play("team0", "player0", game.team0.player0.cards[0]);
    assert.equal(game.roundInfo.team0.books.length + game.roundInfo.team1.books.length, 1);
    assert.equal(game.roundInfo.turn, 2);
    for (var i = 0; i < 12; i++) {
    }
    console.log("test_card_playing passed!");
};

var make_initialized_game = function (promptBid, promptPlay, sendBookWinner, sendScore) {
    var game = new spades.Game();
    game.reset();
    return game;
};

run_all_tests();
