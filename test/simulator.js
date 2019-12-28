var Web3 = require('web3');  // 导入web3模块
var fs = require('fs');    // fs模块读取.sol合约文件
const abi = require('ethereumjs-abi');
var TPC = require('./TPC');
var MPC = require('./MPC');
var logger = require('./logger');
var Graph = require('./topo');
var jsnx = require('jsnetworkx'); // in Node

var gasLogger = logger.gasLogger;
var channelLogger = logger.channelLogger;
// 通过web3连接私有链。 (web3通过geth连接区块链中的结点)
wsProvider = new Web3.providers.WebsocketProvider("ws://localhost:8549");
var web3 = new Web3(wsProvider);  // 通过geth连接私有链中的结点
 
 
var tpc_contract_abi = JSON.parse(fs.readFileSync("./build/contracts_SimplePaymentChannel_sol_SimplePaymentChannel.abi"));  // 读取编译合约的abi文件。
// var spc_bytecode = fs.readFileSync("./build/contracts_SimplePaymentChannel_sol_SimplePaymentChannel.bin");  // 读取编译合约的二进制文件。

var mpc_contract_abi = JSON.parse(fs.readFileSync("./build/contracts_MultipartyChannel_sol_MultipartyChannel.abi"));  // 读取编译合约的abi文件。
// var spc_bytecode = fs.readFileSync("./build/contracts_MultipartyChannel_sol_MultipartyChannel.bin");  // 读取编译合约的二进制文件。

const tpc_address = '0xd500493C86664900F34CF9A6dEc23b86b5313688';
const mpc_address = '0x95050CA71d80A4e39ee529812C4d73cC255333fE';

const tpc_contract = new web3.eth.Contract(tpc_contract_abi, tpc_address);
const mpc_contract = new web3.eth.Contract(mpc_contract_abi, mpc_address);

var TPC_OBJ = new TPC(tpc_contract, web3);
var MPC_OBJ = new MPC(mpc_contract, web3);


async function createTopo(accounts) {
    var channels_id = new Array();
    var edges = Graph.edges(); 
    for (var id in edges) {
        var edge = edges[id];
        console.log("edge: ", edge[0], " vs", edge[1]);
        var alice = accounts[edge[0]];
        var bob   = accounts[edge[1]];
        var channel_id = await TPC_OBJ.createChannel(alice, bob, '1000', '1000');
        Graph.adj.get(edge[0]).get(edge[1]).channel_id = channel_id;
        channels_id.push(channel_id);
        channelLogger.info('createChannel: ', edge[0], ' <--> ', edge[1]);
    }
    return channels_id;
}

async function createMPC(tpc_address, parties, channels_id) {
    channelLogger.info("createMPC start...");
    await MPC_OBJ.createMPC(tpc_address, parties, channels_id);
    channelLogger.info("createMPC end...");
}

function genTx(transaction, accounts) {
    var txs = new Array();
    for (var i in transaction) {
        var t = transaction[i];
        var src = t[0];
        var dst = t[1];
        var weis = web3.utils.toWei(t[2], 'ether');
        txs.push({
            "channel_id": Graph.adj.get(src).get(dst).channel_id,
            "src": accounts[src],
            "dst": accounts[dst],
            "weis": weis
        });
    }
    return txs;
}

function reviseTransactions(transactions) {
    var revised = new Array();
    for (var i in transactions) {
        var t = transactions[i];
        var src = t[0];
        var dst = t[1];
        var ether = t[2];
        var path = jsnx.shortestPath(Graph, {
            "source": src,
            "target": dst
        });
        if (path.length == 2) {
            if (src > dst) {
                t = [dst, src, '-' + ether];
            }
            revised.push(t);
        }
        else if (path.length >= 3) { // long path, need route
            for (var i = 0; i < path.length - 1; i++) {
                var new_src = path[i];
                var new_dst = path[i+1];
                if (new_src > new_dst) {
                    revised.push([new_dst, new_src, '-' + ether]);
                } else {
                    revised.push([new_src, new_dst, ether]);
                }
            }
        }
    }
    console.log("revides: ", revised);
    revised.sort();
    console.log("revide sorted: ", revised);

    var merged = new Array();
    // merge the same src and dst
    for (var i = 0; i < revised.length; i++) {
        var ti = revised[i];
        for (var j = i + 1; j < revised.length; j++) {
            var tj = revised[j];
            if (ti[0] != tj[0] || ti[1] != tj[1]) {
                break;
            }
        }
        var sum = 0;
        for (var index = i ; index < j; index++) {
            sum += parseInt(revised[index][2])
        }
        if (sum > 0 ) {
            merged.push([ti[0], ti[1], sum.toString()]);
        } else if (sum < 0) {
            sum = -sum;
            merged.push([ti[1], ti[0], sum.toString()]);
        } else { // sum == 0
            console.log("a zero transaction");
        }
        i = j - 1;
    }
    console.log("merged: ", merged);
    return merged;
}

// game generateTransactions
function generateTransactions(accounts) {
    var transactions = new Array()
    var count = Graph.nodes().length;

    var winner = Math.floor(Math.random() * count);
    var ether = Math.round((Math.random() + 0.5) * 5);

    for (var i = 0; i < count; i++) {
        if (i != winner) {
            transactions.push([i, winner, ether.toString()]);
        }
    }
    channelLogger.info("generate transactions: ", transactions);
    revisedTxs = reviseTransactions(transactions);
    channelLogger.info("revised transactions: ", revisedTxs);
    var txs = genTx(revisedTxs, accounts);
    return txs;
}

async function executeTx(txs, parties, version) {
    await MPC_OBJ.updateMPC(0, parties, txs, version);
}

async function simulation() {
    console.log("simulation begin...");
    var accounts = await web3.eth.getAccounts();

    var parties = new Array();
    for (var i = 0; i < Graph.nodes().length; i++) {
        parties.push(accounts[i]);
    }

    var channels_id = await createTopo(parties);
    console.log("channels_id = ", channels_id);

    
    // // create mpc
    await createMPC(tpc_address, parties, channels_id);

    // for (var i = 0; i < 10; i++) {
    //     var txs = genM2MTx(accounts);
    //     console.log("round ", i, "...");
    //     console.log("txs = ", txs);
    //     await executeTx(txs, accounts);
    // }
    var version = 1;
    for (var i = 0; i < 10; i++) {
        var t = generateTransactions(parties);
        await executeTx(t, parties, version);
        version += 1;
    }

    console.log("simulation end...");
}

(async function run(){
   await simulation();
   wsProvider.disconnect();
 })();