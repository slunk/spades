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
            if (!rooseveltRules || !(i == 0 || i == 26 || i == 39)) {
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
        if (this.cards.length == 0) {
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
        var idx = this.cards.indexOf(card);
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

var SERVER_ACTION = {
    PROMPT_BID: "PROMPT_BID",
    PROMPT_PLAY: "PROMPT_PLAY",
    SEND_CARDS: "SEND_CARDS",
    SEND_BOOK_WINNER: "SEND_BOOK_WINNER",
    SEND_SCORES: "SEND_SCORES",
};

var bidActions = {
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

this.Game = function () {
    this.MAX_SCORE = 800;
    this.team0 = new Team("team0");
    this.team1 = new Team("team1");
    this.roundInfo = {};

    /* reset
     *
     * TODO: description
     *
     * return a single server action
     */
    this.reset = function () {
        this.team0.score = 0;
        this.team1.score = 0;
        this.lastStartingPlayer = {team: "team1", player: "player0"};
        this.currPlayer = {team: "team1", player: "player0"};
        this.currTeam = "team0";
        this.deal();
        this.resetRoundInfo();
        return {action: SERVER_ACTION.PROMPT_BID
            , recipient: "team0"
            , data: null};
    };

    /* bid
     *
     * params:
     *
     * TODO: description
     *
     * return list of server actions
     */
    this.bid = function (team, bid) {
        console.log("BID");
        console.log(bid);
        var serverActions = [];
        if (this.roundInfo[team].bid.blind) {
            serverActions.push({action: SERVER_ACTION.SEND_CARDS, recipient: {team: team, player: "player0"}, data: this[team].player0.cards});
            serverActions.push({action: SERVER_ACTION.SEND_CARDS, recipient: {team: team, player: "player1"}, data: this[team].player1.cards});
        }
        if (bid == bidActions["show-cards"]) {
            this.roundInfo[team].bid.blind = false;
            serverActions.push({action: SERVER_ACTION.PROMPT_BID, recipient: this.currTeam, data: null});
            return serverActions;
        }
        this.roundInfo[team].bid.val = bid.val;
        this.roundInfo[team].bid.mult = bid.mult;
        if (!this.bidsIn()) {
            this.rotateTeam();
            console.log(this.currTeam);
            serverActions.push({action: SERVER_ACTION.PROMPT_BID, recipient: this.currTeam, data: null});
            return serverActions;
        }
        serverActions.push({action: SERVER_ACTION.PROMPT_PLAY, recipient: this.currPlayer});
        return serverActions;
    };

    /* play
     *
     * take a player object and a card id.
     *
     * Add the (player, card) pair to the current book, if every card is in,
     * determine the winner, and update game state.
     *
     * return a list of server actions.
     */
    this.play = function (team, player, card) {
        var serverActions = [];
        var currBook = this.roundInfo.currBook;
        currBook.push({team: team, player: player, card: card});
        if (currBook.length >= 4) {
            var winner = this.determineWinner(currBook)
                , numBooks = null;
            this.roundInfo[winner.team].books.push(currBook);
            numBooks = this.roundInfo[winner.team].books.length;
            this.currPlayer = {team: winner.team, player: winner.player};
            this.roundInfo.currBook = [];
            this.roundInfo.turn++;
            serverActions.push({action: SERVER_ACTION.SEND_BOOK_WINNER, recipient: "all", data: {team: winner.team, player: winner.player, books: numBooks}});
            if (this.roundOver()) {
                this.updateScores();
                serverActions.push({action: SERVER_ACTION.SEND_SCORES, recipient: "all", data: {team0: this.team0.score, team1: this.team1.score}});
                this.currPlayer = this.lastStartingPlayer;
                this.rotatePlayer();
                this.lastStartingPlayer = this.currPlayer;
                if (!this.gameOver()) {
                    this.deal();
                    this.resetRoundInfo();
                    serverActions.push({action: SERVER_ACTION.PROMPT_BID, recipient: this.currTeam});
                }
                return serverActions;
            }
        } else {
            this.rotatePlayer();
        }
        serverActions.push({action: SERVER_ACTION.PROMPT_PLAY, recipient: this.currPlayer});
        return serverActions;
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
        return bidIn.call(this, "team0") && bidIn.call(this, "team1");;
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
}

this.Player = Player;
this.Team = Team;
this.bidActions = bidActions;
this.SERVER_ACTION = SERVER_ACTION;
