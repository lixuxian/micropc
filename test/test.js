class Tx {
    constructor(id, ab, bb) {
      this.id = id;
      this.new_ab = ab;
      this.new_bb = bb;
    }
}

class MPTX {
    constructor(tx) {

      this.tx_map = new Map();
      this.tx_map.set(tx.id, tx);
      // myMap.set(0, "zero");
      // myMap.set(1, "one");
      // for (var [key, value] of myMap) {
      //   console.log(key + " = " + value);
      // }
    }
  
    printTx() {
      for (var [key, value] of this.tx_map) {
        console.log("channel id:", value.id, " ab: ", value.new_ab, " bb: ", value.new_bb);
      } 
    }
}

var t1 = new Tx(1, 101, 99);
var mtx = new MPTX(t1);
mtx.printTx();
