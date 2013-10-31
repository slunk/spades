var card = require('./public/card.js');

var CardFactory = function () {
    this._cardByID = {};

    this.getCardByID = function (id) {
        if (!(id in this._cardByID)) {
            this._cardByID[id] = new card.Card(id);
        }
        return this._cardByID[id];
    };

    this._suitVal = function (suit) {
        if (suit == "heart") {
            return 0;
        }
        if (suit == "club") {
            return 13;
        }
        if (suit == "diamond") {
            return 2 * 13;
        }
        return 3 * 13;
    };

    this._cardVal = function (card) {
        if (card == "A") {
            return 12;
        }
        if (card == "K") {
            return 11;
        }
        if (card == "Q") {
            return 10;
        }
        if (card == "J") {
            return 9;
        }
        return (+card) - 2;
    };

    this.getCard = function (card, suit) {
        var sv = this._suitVal(suit),
            cv = this._cardVal(card);
        if (card == "B") {
            return this.getCardByID(54);
        } else if (card == "L") {
            return this.getCardByID(53);
        } else if (card == "2" && suit == "spade") {
            return this.getCardByID(52);
        }
        return this.getCardByID(sv + cv);
    };
};

exports.CardFactory = CardFactory;

var Deck = function (rooseveltRules) {
    this.cards = [];
    this.discard = [];

    this.shuffle = function () {
        this.cards = [];
        this.discard = [];
        var i;

        for (i = 0; i < 52; i++) {
            /* Remove the 2s of hearts, diamonds, and spades. */
            if (!rooseveltRules || !(i === 0 || i === 26 || i === 39)) {
                this.cards.push(new card.Card(i));
            }
        }
        if (rooseveltRules) {
            this.cards.push(new card.Card(52));
            this.cards.push(new card.Card(53));
            this.cards.push(new card.Card(54));
        }
        this.cards.sort(function () { return 0.5 - Math.random(); });
    };

    this.shuffle();

    this.empty = function () {
        if (this.cards.length === 0) {
            return true;
        }
        return false;
    };

    this.draw = function () {
        return this.cards.pop();
    };

    this.discard = function (card) {
        this.discard.push(card);
    };

    this.pprint = function () {
        return this.cards.map(function (card) { return card.pprint(); });
    };
};

/* SERVER_ACTION
 *
 * Enum for any type of action the game requires the server to relay to the
 * clients.
 */
var SERVER_ACTION = {
    PROMPT_BID: "PROMPT_BID",
    PROMPT_PLAY: "PROMPT_PLAY",
    SEND_CARDS: "SEND_CARDS",
    SEND_BOOK_WINNER: "SEND_BOOK_WINNER",
    SEND_SCORES: "SEND_SCORES",
};

/* bidType
 *
 * Valid bids and their values for this version of spades.
 */
var bidType = {
    "show-cards": "NOBID",
    "board": {val: 4, mult: 1},
    "5": {val: 5, mult: 1},
    "6": {val: 6, mult: 1},
    "7": {val: 7, mult: 1},
    "8": {val: 8, mult: 1},
    "9": {val: 9, mult: 1},
    "2-for-10": {val: 10, mult: 2},
    "11": {val: 11, mult: 1},
    "12": {val: 12, mult: 1},
    "boston": {val: 13, mult: 1}
};

var Bid = function () {
    this._blind = true;
    this._mult = null;
    this._val = null;

    // getters

    this.blind = function () {
        return this._blind;
    };

    this.mult = function () {
        return this._mult;
    };

    this.points = function () {
        return this._points(this.blind(), this.val(), this.mult());
    };

    this.val = function () {
        return this._val;
    };

    // setters

    this.setBlind = function (val) {
        this._blind = val;
    };

    this.setMult = function (num) {
        this._mult = num;
    };

    this.setVal = function (num) {
        this._val = num;
    };

    // others

    this._points = function (blind, val, mult) {
        return blind ? 20 * val * mult : 10 * val * mult;
    };

    this.equals = function (other) {
        var sameBlind = this.blind() == other.blind(),
            sameMult = this.mult() == other.mult(),
            sameVal = this.val() == other.val();
        return sameBlind && sameMult && sameVal;
    };

    this.isComplete = function () {
        var valSet = this.val() !== null,
            multSet = this.mult() !== null;
        return valSet && multSet;
    };
};

var TeamData = function () {
    this._player0 = [];
    this._player1 = [];
    this._books = [];
    this._bid = new Bid();

    // getters

    this.bid = function () {
        return this._bid;
    };

    this.books = function () {
        return this._books;
    };

    this.cards = function (player) {
        return this['_' + player];
    };

    this.numBooks = function () {
        return this.books().length;
    };

    this.points = function () {
        return this._points(this.bid(), this.numBooks());
    };
    
    // setters

    this.setCards = function (player, cards) {
        this['_' + player] = cards;
    };

    // others

    this.addBook = function (book) {
        this._books.push(book);
    };

    this.bidComplete = function () {
        return this._bid.isComplete();
    };

    this.play = function (player, card) {
        var cards = this.cards(player),
            idx;
        for (idx = 0; idx < cards.length; idx++) {
            if (cards[idx].equals(card)) {
                break;
            }
        }
        cards.splice(idx, 1);
        return true;
    };

    this._points = function (bid, numBooks) {
        var points = bid.points();
        if (numBooks < bid.val() || numBooks >= bid.val() + 3) {
            points = -points;
        }
        return points;
    };
};

var nextPlayer = function (player) {
    if (player.team == "team0" && player.player == "player0") {
        return {team: "team1", player: "player0"};
    } else if (player.team == "team1" && player.player == "player0") {
        return {team: "team0", player: "player1"};
    } else if (player.team == "team0" && player.player == "player1") {
        return {team: "team1", player: "player1"};
    }
    return {team: "team0", player: "player0"};
};

var RoundData = function (startingPlayer) {
    this._turn = 1;
    this._spadesPlayed = false;
    this._currBook = [];
    this._team0 = new TeamData();
    this._team1 = new TeamData();
    this._currPlayer = startingPlayer;

    // getters

    this.bid = function (team) {
        return this.teamData(team).bid();
    };

    this.cards = function (team, player) {
        return this.teamData(team).cards(player);
    };

    this.currBook = function () {
        return this._currBook;
    };

    this.currBookWinner = function () {
        var first = this._currBook[0];
        var others = this._currBook.slice(1, this._currBook.length);
        return this._currBookWinnerHelper(first, others);
    };

    this.currPlayer = function () {
        return this._currPlayer;
    };

    this.numBooks = function (team) {
        return this.teamData(team).numBooks();
    };

    this.playableCards = function (team, player) {
        var allCards = this.cards(team, player),
            cBook = this._currBook,
            spadesPlayed = this.spadesPlayed();
        return this._playableCards(allCards, cBook, spadesPlayed);
    };

    this.points = function (team) {
        return this.teamData(team).points();
    };

    this.spadesPlayed = function () {
        return this._spadesPlayed;
    };

    this.teamData = function (team) {
        return this['_' + team];
    };

    this.turn = function () {
        return this._turn;
    };

    // setters

    this.setCurrPlayer = function (team, player) {
        this._currPlayer = {team: team, player: player};
    };

    this.setSpadesPlayed = function (val) {
        this._spadesPlayed = val;
    };

    // others

    this.addBook = function (team, book) {
        this.teamData(team).addBook(book);
    };

    this.bidsComplete = function () {
        return this._team0.bidComplete() && this._team1.bidComplete();
    };

    this.bookComplete = function () {
        return this._currBook.length == 4;
    };

    this.clearCurrBook = function () {
        this._currBook = [];
    };

    this.currBookComplete = function () {
        return this._currBook.length == 4;
    };

    this.deal = function () {
        var deck = new Deck(true),
            one = [],
            two = [],
            three = [],
            four = [];
        while (!deck.empty()) {
            one.push(deck.draw());
            two.push(deck.draw());
            three.push(deck.draw());
            four.push(deck.draw());
        }
        this.teamData('team0').setCards('player0', one);
        this.teamData('team1').setCards('player0', two);
        this.teamData('team0').setCards('player1', three);
        this.teamData('team1').setCards('player1', four);
    };

    this._currBookWinnerHelper = function (first, others) {
        var winner = first;
        others.forEach(function (play) {
            var sameSuitAsFirst = play.card.suit() == first.card.suit(),
                isSpade = play.card.suit(),
                trumpsWinner = play.card.id > winner.card.id;
            if ((sameSuitAsFirst || isSpade) && trumpsWinner) {
                winner = play;
            }
        });
        return winner;
    };

    this.incrementTurn = function () {
        this._turn++;
        this._currBook = [];
    };

    this.over = function () {
        return this.turn() > 13;
    };

    this.play = function (team, player, card) {
        if (this.teamData(team).play(player, card)) {
            if (card.suit() == "spade") {
                this.setSpadesPlayed(true);
            }
            this._currBook.push({'team': team, 'player': player, 'card': card});
            this.rotatePlayer();
        }
        return true;
    };

    this._playableCards = function (allCards, book, spadesPlayed) {
        var playable = [],
            first = null;
        if (book.length === 0) {
            playable = allCards.filter(function (card) {
                return card.suit() != "spade";
            });
            if (spadesPlayed || playable.length === 0) {
                return allCards;
            }
            return playable;
        }
        first = book[0].card;
        playable = allCards.filter(function (card) {
            return card.suit() == first.suit();
        });
        if (playable.length === 0) {
            return allCards;
        }
        return playable;
    };

    this.rotatePlayer = function () {
        this._currPlayer = nextPlayer(this._currPlayer);
    };

    this.deal();
};

var GameData = function () {
    this.MAX_SCORE = 800;
    this._scores = {};
    this._scores.team0 = 0;
    this._scores.team1 = 0;
    this._startingPlayer = {'team': 'team1', 'player': 'player0'};
    this._currTeam = "team0";
    this._currRound = new RoundData(this._startingPlayer);

    // getters

    this.bid = function (team) {
        return this._currRound.bid(team);
    };

    this.cards = function (team, player) {
        return this._currRound.cards(team, player);
    };

    this.currBookWinner = function () {
        return this._currRound.currBookWinner();
    };

    this.currPlayer = function () {
        return this._currRound.currPlayer();
    };

    this.currTeam = function () {
        return this._currTeam;
    };

    this.numBooks = function (team) {
        return this._currRound.numBooks(team);
    };

    this.playableCards = function (team, player) {
        return this._currRound.playableCards(team, player);
    };

    this.points = function (team) {
        return this.currRound().points(team);
    };

    this.score = function (team) {
        return this._scores[team];
    };

    this.turn = function () {
        return this._currRound.getTurn();
    };

    // setters

    this.setCurrPlayer = function (team, player) {
        this._currRound.setCurrPlayer(team, player);
    };

    // others

    this.addBook = function (team, book) {
        this._currRound.addBook(team, book);
    };

    this.bidsComplete = function () {
        return this._currRound.bidsComplete();
    };

    this.bookComplete = function () {
        return this._currRound.bookComplete();
    };

    this.clearCurrBook = function () {
        this._currRound.clearCurrBook();
    };

    this.currRound = function () {
        return this._currRound;
    };

    this.incrementTurn = function () {
        this._currRound.incrementTurn();
    };

    this._overHelper = function (team) {
        return this.score(team) > this.MAX_SCORE;
    };

    this.over = function () {
        return this._overHelper('team0') || this._overHelper('team1');
    };

    this.play = function (team, player, card) {
        return this._currRound.play(team, player, card);
    };

    this.resetRoundInfo = function () {
        this._currRound = new RoundData(this._startingPlayer);
        this.rotateStartingPlayer();
    };

    this.rotatePlayer = function () {
        this._currRound.rotatePlayer();
    };

    this.rotateStartingPlayer = function () {
        this._startingPlayer = nextPlayer(this._startingPlayer);
    };

    this.rotateTeam = function () {
        if (this._currTeam == "team0") {
            this._currTeam = "team1";
        } else {
            this._currTeam = "team0";
        }
    };

    this.roundOver = function () {
        this._currRound.over();
    };

    this.updateScore = function (team) {
        this._scores[team] += this.points(team);
    };

    this.updateScores = function () {
        this.updateScore('team0');
        this.updateScore('team1');
    };
};

var GameInterface = function (callbacks, rules) {
    this._callbacks = callbacks;

    this.sendToAll = function (action, data) {
        this._callbacks.sendToAll(action, data);
    };

    this.sendToTeam = function (team, action, data) {
        this._callbacks.sendToTeam(team, action, data);
    };

    this.sendToPlayer = function (team, player, action, data) {
        this._callbacks.sendToPlayer(team, player, action, data);
    };

    this.sendCurrentTeam = function (action, data) {
        var team = this._gameInfo.getCurrTeam();
        this.sendToTeam(team, action, data);
    };

    this.sendToCurrentPlayer = function (action, data) {
        var team = this._gameInfo.getCurrPlayer().team,
            player = this._gameInfo.getCurrPlayer().player;
        this.sendToPlayer(team, player, action, data);
    };

    this.reset = function () {
        var team;
        this._gameData = new GameData(this);
        team = this._gameData.currTeam();
        this.sendToTeam(team, SERVER_ACTION.PROMPT_BID);
    };

    /* bid
    *
    * params: team (string), bid (bidType)
    *
    * Either make this.currTeam's bid NOT blind this round if instructed to
    * show cards or set the bid to whatever is passed in. If only one team has
    * placed a bid this round, change this.currTeam to the other team.
    */
    this.bid = function (team, bid) {
        if (this._gameData.bid(team).blind()) {
            this.sendCards(team, 'player0');
            this.sendCards(team, 'player1');
        }
        if (bid == bidType["show-cards"]) {
            this._gameData.bid(team).setBlind(false);
            this.sendToTeam(this._gameData.currTeam(), SERVER_ACTION.PROMPT_BID);
        } else {
            this._gameData.bid(team).setVal(bid.val);
            this._gameData.bid(team).setMult(bid.mult);
            if (!this._gameData.bidsComplete()) {
                this._gameData.rotateTeam();
                this.sendToTeam(this._gameData.currTeam(), SERVER_ACTION.PROMPT_BID);
            } else {
                this.promptPlay();
            }
        }
    };

    /* play
     *
     * params: team (string), player (string), card (Card)
     *
     * Add the (player, card) pair to the current book, if every card is in,
     * determine the winner, and update game state.
     */
    this.play = function (team, player, card) {
        if (!this._gameData.play(team, player, card)) {
            // Send Error?
            return;
        }
        if (this._gameData.bookComplete()) {
            var winner = this._gameData.currBookWinner(),
                numBooks = 0;
            this._gameData.addBook(winner.team, winner);
            numBooks = this._gameData.numBooks(winner.team);
            this.sendToAll(SERVER_ACTION.SEND_BOOK_WINNER,
                {team: winner.team, player: winner.player, books: numBooks});
            this._gameData.incrementTurn();
            this._gameData.setCurrPlayer(winner.team, winner.player);
        }
        if (this._gameData.roundOver()) {
            var team0Score = this._gameData.score('team0'),
                team1Score = this._gameData.score('team1');
            this._gameData.resetRoundInfo();
            this.sendToAll(SERVER_ACTION.SEND_SCORES, {team0: team0Score, team1: team1Score});
            this.sendToTeam(this._gameData.currTeam(), SERVER_ACTION.PROMPT_BID);
        } else {
            this.promptPlay();
        }
    };

    this.sendToCurrPlayer = function (action, data) {
        var player = this._gameData.currPlayer();
        this.sendToPlayer(player.team, player.player, action, data);
    };

    this.sendCards = function (team, player) {
        var cards = this._gameData.cards(team, player);
        this.sendToPlayer(team, player, SERVER_ACTION.SEND_CARDS, cards);
    };

    this.promptPlay = function () {
        var currPlayer = this._gameData.currPlayer(),
            team = currPlayer.team,
            player = currPlayer.player,
            playable = this._gameData.playableCards(team, player);
        this.sendToCurrPlayer(SERVER_ACTION.PROMPT_PLAY, {playable: playable});
    };

    this.promptBid = function () {
        this.sendToTeam(this._gameData.currTeam(), SERVER_ACTION.PROMPT_BID);
    };
};

exports.bidType = bidType;
exports.SERVER_ACTION = SERVER_ACTION;
exports.Bid = Bid;
exports.TeamData = TeamData;
exports.RoundData = RoundData;
exports.GameData = GameData;
exports.GameInterface = GameInterface;