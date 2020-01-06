var jsnx = require('jsnetworkx'); // in Node

var G = new jsnx.Graph();
G.addEdgesFrom([[0, 1], [1, 2], [1, 3], [2, 4]]);

// var nodes = 25;
// var p = 0.4;
// var G = new jsnx.binomialGraph(nodes, p);
module.exports = G;
