var fs = require('fs'); 
var nodes = JSON.parse(fs.readFileSync("nodes.txt"));
var channels = JSON.parse(fs.readFileSync("channels.txt"));
var jsnx = require('jsnetworkx'); // in Node

var G = new jsnx.Graph();

var node2id = new Map();

// for (var i = 0; i < nodes.length; i++) {
//     var hash_id = nodes[i].id;
//     node2id.set(hash_id, i);
// }

var file = "";

var id_count = 0;

for (var i = 0; i < channels.length; i++) {
    // console.log(node2id.get(channels[i].source), " <--> ", node2id.get(channels[i].target));
    // var str = node2id.get(channels[i].source) + "," + node2id.get(channels[i].target) + "\n";
    // file += str;
    var src = channels[i].source;
    var tar = channels[i].target;
    var src_id = 0;
    var tar_id = 0;
    if (!node2id.has(src)) {
        src_id = id_count++;
        node2id.set(src, src_id);
    } else {
        src_id = node2id.get(src);
    }
    if (!node2id.has(tar)) {
        tar_id = id_count++;
        node2id.set(tar, tar_id);
    } else {
        tar_id = node2id.get(tar);
    }
    var str = src_id + "," + tar_id + "\n";
    file += str;
    G.addEdge(parseInt(src_id), parseInt(tar_id));

}

// fs.writeFile("./processed_channels.txt", file, function(error) {
//     if (error) {
//         console.log("writeFile error: ", error);
//     }
// })

var nodes = new Array();
var nums = new Array(100, 200, 300, 400, 500, 600, 700, 800, 900, 1000);
for (var n = 0; n < nums.length; n++) {
    var num = parseInt(nums[n]);
    for (var i = 0; i < num; i++) {
        nodes.push(i);
    }
    
    var sub_G = G.subgraph(nodes);
    console.log(sub_G.nodes());
    console.log(sub_G.edges());
    
    var file_str = "";
    for (var i = 0; i < sub_G.edges().length; i++) {
        var src = sub_G.edges()[i][0];
        var dst = sub_G.edges()[i][1];
        file_str += src.toString() + "," + dst.toString() + "\n";
    }
    
    var filename = "./node-" + num.toString() + ".csv";
    fs.writeFile(filename, file_str, function(error) {
        if (error) {
            console.log("writeFile error: ", error);
        }
    })
}
