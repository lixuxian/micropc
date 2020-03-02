var jsnx = require('jsnetworkx'); // in Node
var fs = require('fs'); // in Node

var G = new jsnx.Graph();
// G.addEdgesFrom([[0, 1], [1, 2], [1, 3], [2, 4]]);

// var load_from_file = true;
var load_from_file = false;
// var filepath = "./data/node-900.csv";
var filepath = "./random/random-100.csv";

if (load_from_file) {
    var data = fs.readFileSync(filepath, "utf-8");
    var rows = new Array();
    rows = data.split("\n");
    for (var i = 0; i < rows.length && rows[i].length > 0; i++) {
        var edge = rows[i].split(",");
        G.addEdgesFrom([[parseInt(edge[0]), parseInt(edge[1])]]);
    }
} else {
    // var nodes = 10;
    // var p = 0.4;
    // G = new jsnx.binomialGraph(nodes, p);
    G.addEdgesFrom([[0, 1], [1, 2]]);
}
console.log("G.nodes(): ", G.nodes());
// console.log("G.edges(): ", G.edges());
module.exports = G;
