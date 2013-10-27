var Card = function (id) {
    this.id = id;

    this.suit = function () {
        if (this.id < 13) {
            return "heart";
        } else if (this.id < 2 * 13) {
            return "club";
        } else if (this.id < 3 * 13) {
            return "diamond";
        }
        return "spade";
    };

    this.value = function() {
        if (this.id == 52) {
            return "2";
        }
        if (this.id == 53) {
            return "L";
        }
        if (this.id == 54) {
            return "B";
        }
        if (this.id % 13 < 9) {
            return "" + ((this.id % 13) + 2);
        } else if (this.id % 13 == 9) {
            return "J";
        } else if (this.id % 13 == 10) {
            return "Q";
        } else if (this.id % 13 == 11) {
            return "K";
        }
        return "A";
    };

    this.pprint = function () {
        if (this.id < 52) {
            return this.value() + " of " + this.suit() + "s";
        }
        return this.value();
    };

    this.imageFileName = function () {
        return "Playing_card_" + this.suit() + "_" + this.value() + ".svg";
    };

    this.equals = function (other) {
        return this.id === other.id;
    };
};

this.Card = Card;
