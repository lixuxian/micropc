var jsnx = require('jsnetworkx'); // in Node

// var G = new jsnx.Graph();
// G.addEdgesFrom([[1, 2], [2, 3], [2, 4], [3, 5]]);

var nodes = 15;
var p = 0.4;
var G = new jsnx.binomialGraph(nodes, p);
// p = jsnx.shortestPath(G, {
//     "source": 1,
//     "target": 4
// })
// console.log("path: ", p, " len: ", p.length);
module.exports = G;

