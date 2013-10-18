var card = require('./public/card.js');

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

var Player = function (team, player) {
    this.cards = [];
    this.place = team + "-" + player;
    this.team = team;
    this.player = player;

    this.play = function (card) {
        var idx;
        for (idx = 0; idx < this.cards.length; idx++) {
            if (this.cards[idx].equals(card)) {
                break;
            }
        }
        this.cards.splice(idx, 1);
    };

    this.has = function (card) {
        var ret = false;
        this.cards.forEach(function (x) {
            if (x.id == card.id) {
                ret = true;
            }
        });
        return ret;
    };
};

var Team = function (id) {
    this.id = id;
    this.score = 0;
    this.player0 = new Player(id, "player0");
    this.player1 = new Player(id, "player1");
    this.player0.teammate = this.player1;
    this.player1.teammate = this.player0;
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

/* Game
 *
 * Stores global state of a game of spades and the state of a round in the game
 * while it is in progress. All functionality is provided by the reset, bid, and
 * play methods. These all return server action(s) which the server must pass on
 * to the clients.
 */
exports.Game = function (sendToAll, sendToTeam, sendToPlayer) {
    this.MAX_SCORE = 800;
    this.team0 = new Team("team0");
    this.team1 = new Team("team1");
    this.roundInfo = {};
    this.sendToAll = sendToAll;
    this.sendToTeam = sendToTeam;
    this.sendToPlayer = sendToPlayer;

    this.sendToCurrPlayer = function (action, data) {
        this.sendToPlayer(this.currPlayer.team, this.currPlayer.player,
            action, data);
    };

    this.sendCards = function (team, player) {
        var cards = this[team][player].cards;
        this.sendToPlayer(team, player, SERVER_ACTION.SEND_CARDS, cards);
    };

    /* reset
     *
     * Reset the game to default settings before any bids or plays have occured.
     */
    this.reset = function () {
        this.team0.score = 0;
        this.team1.score = 0;
        this.lastStartingPlayer = {team: "team1", player: "player0"};
        this.currPlayer = {team: "team1", player: "player0"};
        this.currTeam = "team0";
        this.deal();
        this.resetRoundInfo();
        this.sendToTeam('team0', SERVER_ACTION.PROMPT_BID, null);
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
        if (this.roundInfo[team].bid.blind) {
            this.sendCards(team, 'player0');
            this.sendCards(team, 'player1');
        }
        if (bid == bidType["show-cards"]) {
            this.roundInfo[team].bid.blind = false;
            this.sendToTeam(this.currTeam, SERVER_ACTION.PROMPT_BID);
        } else {
            this.roundInfo[team].bid.val = bid.val;
            this.roundInfo[team].bid.mult = bid.mult;
            if (!this.bidsIn()) {
                this.rotateTeam();
                this.sendToTeam(this.currTeam, SERVER_ACTION.PROMPT_BID);
            } else {
                this.sendToCurrPlayer(SERVER_ACTION.PROMPT_PLAY,
                    {playable: this.playableCards(this.currPlayer.team, this.currPlayer.player)});
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
        var currBook = this.roundInfo.currBook;
        if (card.suit() == "spade") {
            this.roundInfo.spadesPlayed = true;
        }
        this[team][player].play(card);
        currBook.push({team: team, player: player, card: card});
        if (currBook.length >= 4) {
            var winner = this.determineWinner(currBook),
                numBooks = null;
            this.roundInfo[winner.team].books.push(currBook);
            numBooks = this.roundInfo[winner.team].books.length;
            this.currPlayer = {team: winner.team, player: winner.player};
            this.roundInfo.currBook = [];
            this.roundInfo.turn++;
            this.sendToAll(SERVER_ACTION.SEND_BOOK_WINNER,
                {team: winner.team, player: winner.player, books: numBooks});
            if (this.roundOver()) {
                this.updateScores();
                this.sendToAll(SERVER_ACTION.SEND_SCORES, {team0: this.team0.score, team1: this.team1.score});
                this.currPlayer = this.lastStartingPlayer;
                this.rotatePlayer();
                this.lastStartingPlayer = this.currPlayer;
                if (!this.gameOver()) {
                    this.deal();
                    this.resetRoundInfo();
                    this.sendToTeam(this.currTeam, SERVER_ACTION.PROMPT_BID);
                }
            }
        } else {
            this.rotatePlayer();
        }
        this.sendToCurrPlayer(SERVER_ACTION.PROMPT_PLAY,
            {playable: this.playableCards(this.currPlayer.team, this.currPlayer.player)});
    };

    /* helper functions */

    this.determineWinner = function (book) {
        var first = book[0];
        var others = book.slice(1, book.length);
        var winner = first;
        others.forEach(function (play) {
            if (play.card.suit() == first.card.suit() || play.card.suit() == "spade") {
                if (play.card.id > winner.card.id) {
                    winner = play;
                }
            }
        });
        return winner;
    };

    this.updateScores = function () {
        var updateScore = function (team) {
            var books = this.roundInfo[team].books.length;
            var bid = this.roundInfo[team].bid;
            var points = 10 * bid.val * bid.mult;
            if (bid.blind) {
                points *= 2;
            }
            if (books >= bid.val) {
                if (books >= bid.val + 3) {
                    this[team].score -= points;
                } else {
                    this[team].score += points;
                }
            } else {
                this[team].score -= points;
            }
        };
        updateScore.call(this, "team0");
        updateScore.call(this, "team1");
    };

    this.rotatePlayer = function () {
        if (this.currPlayer.team == "team0" && this.currPlayer.player == "player0") {
            this.currPlayer = {team: "team1", player: "player0"};
        } else if (this.currPlayer.team == "team1" && this.currPlayer.player == "player0") {
            this.currPlayer = {team: "team0", player: "player1"};
        } else if (this.currPlayer.team == "team0" && this.currPlayer.player == "player1") {
            this.currPlayer = {team: "team1", player: "player1"};
        } else if (this.currPlayer.team == "team1" && this.currPlayer.player == "player1") {
            this.currPlayer = {team: "team0", player: "player0"};
        }
    };

    this.rotateTeam = function () {
        if (this.currTeam == "team0") {
            this.currTeam = "team1";
        } else {
            this.currTeam = "team0";
        }
    };

    this.resetRoundInfo = function () {
        this.roundInfo = {
            "turn": 1,
            "spadesPlayed": false,
            "currBook": [],
            "team0": {
                "books": [],
                "bid": {blind: true}
            },
            "team1": {
                "books": [],
                "bid": {blind: true}
            }
        };
    };

    this.playableCards = function (team, player) {
        var playable = null,
            first = null;
        if (this.roundInfo.currBook.length === 0) {
            if (this.roundInfo.spadesPlayed) {
                return this[team][player].cards;
            }
            playable = this[team][player].cards.filter(function (card) {
                return card.suit() != "spade";
            });
            if (playable.length === 0) {
                return this[team][player].cards;
            }
            return playable;
        }
        first = this.roundInfo.currBook[0].card;
        playable = this[team][player].cards.filter(function (card) {
            return card.suit() == first.suit();
        });
        if (playable.length === 0) {
            return this[team][player].cards;
        }
        return playable;
    };

    this.deal = function () {
        this.team0.player0.cards = [];
        this.team0.player1.cards = [];
        this.team1.player0.cards = [];
        this.team1.player1.cards = [];
        var deck = new Deck(true);
        while (!deck.empty()) {
            this.team0.player0.cards.push(deck.draw());
            this.team1.player0.cards.push(deck.draw());
            this.team0.player1.cards.push(deck.draw());
            this.team1.player1.cards.push(deck.draw());
        }
    };

    this.bidsIn = function () {
        var bidIn = function (team) {
            var bid = this.roundInfo[team].bid;
            return 'val' in bid && 'mult' in bid && 'blind' in bid;
        };
        return bidIn.call(this, "team0") && bidIn.call(this, "team1");
    };

    this.roundOver = function () {
        return this.roundInfo.turn > 13;
    };

    this.gameOver = function () {
        if (this.team0.score >= this.MAX_SCORE || this.team1.score >= this.MAX_SCORE) {
            return true;
        }
        return false;
    };
};

exports.bidType = bidType;
exports.SERVER_ACTION = SERVER_ACTION;
