var Web3 = require('web3');  // 导入web3模块
var fs = require('fs');    // fs模块读取.sol合约文件
const abi = require('ethereumjs-abi');
var TPC = require('./TPC');
var MPC = require('./MPC');
var logger = require('./logger');
var Graph = require('./topo');
var jsnx = require('jsnetworkx'); // in Node
var DirectedPay = require('./DP');
var sleep = require('sleep');

var gasLogger = logger.gasLogger;
var channelLogger = logger.channelLogger;
// 通过web3连接私有链。 (web3通过geth连接区块链中的结点)
var opt = { timeout: 3600000 };
wsProvider = new Web3.providers.WebsocketProvider("ws://localhost:8549", opt);
var web3 = new Web3(wsProvider);  // 通过geth连接私有链中的结点
 
var transaction_count = 10;
var mpc_tx_count = 0;
var num_to_update_mpc = 10; 
var tpc_tx_count = 0;
var num_to_update_tpc = 10;  
 
var tpc_contract_abi = JSON.parse(fs.readFileSync("./build/contracts_SimplePaymentChannel_sol_SimplePaymentChannel.abi"));  // 读取编译合约的abi文件。
// var spc_bytecode = fs.readFileSync("./build/contracts_SimplePaymentChannel_sol_SimplePaymentChannel.bin");  // 读取编译合约的二进制文件。

var mpc_contract_abi = JSON.parse(fs.readFileSync("./build/contracts_MultipartyChannel_sol_MultipartyChannel.abi"));  // 读取编译合约的abi文件。
// var spc_bytecode = fs.readFileSync("./build/contracts_MultipartyChannel_sol_MultipartyChannel.bin");  // 读取编译合约的二进制文件。

const tpc_address = '0x93B9B41cA16896325A64e49eeb90EEaF07D35E16';
const mpc_address = '0xDb24Fe71382B96f2c32Ae470250Ee80C2aC33027';

const tpc_contract = new web3.eth.Contract(tpc_contract_abi, tpc_address);
const mpc_contract = new web3.eth.Contract(mpc_contract_abi, mpc_address);

var TPC_OBJ = new TPC(tpc_contract, web3);
var MPC_OBJ = new MPC(mpc_contract, web3);

var init_balance_str = '100000';

async function createTopo(accounts) {
    var channels_id = new Array();
    var edges = Graph.edges(); 
    for (var id in edges) {
        var edge = edges[id];
        console.log("edge: ", edge[0], " vs", edge[1]);
        var alice = accounts[edge[0]];
        var bob   = accounts[edge[1]];
        var channel_id = await TPC_OBJ.createChannel(alice, bob, init_balance_str, init_balance_str);
        Graph.adj.get(edge[0]).get(edge[1]).channel_id = channel_id;
        Graph.adj.get(edge[0]).get(edge[1]).version = 0;
        Graph.adj.get(edge[0]).get(edge[1]).alice = edge[0];
        Graph.adj.get(edge[0]).get(edge[1]).bob = edge[1];
        Graph.adj.get(edge[0]).get(edge[1]).alice_balance = parseInt(init_balance_str);
        Graph.adj.get(edge[0]).get(edge[1]).bob_balance = parseInt(init_balance_str);
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
        var ether = t[2];

        if (Graph.adj.get(src).get(dst).alice == src) {
            new_ab = Graph.adj.get(src).get(dst).alice_balance - parseInt(ether);
            new_ba = Graph.adj.get(src).get(dst).bob_balance + parseInt(ether);
        } else if (Graph.adj.get(src).get(dst).bob == src) {
            new_ab = Graph.adj.get(src).get(dst).alice_balance + parseInt(ether);
            new_ba = Graph.adj.get(src).get(dst).bob_balance - parseInt(ether);
        } else {
            console.log("genTx error!!!");
            process.exit();
        }
        var new_ab_wei = web3.utils.toWei(new_ab.toString(), 'ether');
        var new_ba_wei = web3.utils.toWei(new_ba.toString(), 'ether');
        txs.push({
            "channel_id": Graph.adj.get(src).get(dst).channel_id,
            "src": accounts[src],
            "dst": accounts[dst],
            "new_ab": new_ab_wei,
            "new_ba": new_ba_wei
        });
    }
    return txs;
}

async function getPath(parties, src, dst) {
    var path = [];
    try {
        path = jsnx.shortestPath(Graph, {
            "source": src,
            "target": dst
        });
    } catch (error) {
        if (error instanceof jsnx.exceptions.JSNetworkXNoPath) {
            var alice = parties[src];
            var bob   = parties[dst];
            Graph.addEdgesFrom([[src, dst]]);
            var channel_id = await TPC_OBJ.createChannel(alice, bob, init_balance_str, init_balance_str);
            Graph.adj.get(src).get(dst).channel_id = channel_id;
            Graph.adj.get(src).get(dst).version = 0;
            Graph.adj.get(src).get(dst).alice = src;
            Graph.adj.get(src).get(dst).bob = dst;
            Graph.adj.get(src).get(dst).alice_balance = parseInt(init_balance_str);
            Graph.adj.get(src).get(dst).bob_balance = parseInt(init_balance_str);
            channels_id.push(channel_id);
            channelLogger.info('create missed edge: ', src, ' <--> ', dst);
            path = [src, dst];
        } else {
            throw error;
        }
    }
    return path;
}

async function reviseTransactions(transactions, parties) {
    var revised = new Array();
    for (var i in transactions) {
        var t = transactions[i];
        var src = t[0];
        var dst = t[1];
        var ether = t[2];
        // var path = jsnx.shortestPath(Graph, {
        //     "source": src,
        //     "target": dst
        // });
        var path = await getPath(parties, src, dst);
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
async function generateTransactions(parties) {
    var transactions = new Array();
    var count = Graph.nodes().length;

    var winner = Math.floor(Math.random() * count);
    var ether = Math.round((Math.random() + 1) * 10);

    for (var i = 0; i < count; i++) {
        if (i != winner) {
            transactions.push([i, winner, ether.toString()]);
        }
    }
    channelLogger.info("generate transactions: ", transactions);
    revisedTxs = await reviseTransactions(transactions, parties);
    channelLogger.info("revised transactions: ", revisedTxs);
    // var txs = genTx(revisedTxs, accounts);
    return {
        "transactions": transactions,
        "revisedTxs": revisedTxs
    }
}

async function executeTx_MPC(transactions, txs, parties, version) {
    for (var i in transactions) {
        var tx = transactions[i];
        var s = tx[0];
        var t = tx[1];
        var ether = parseInt(tx[2]);

        Graph.adj.get(s).get(t).version += 1;
        var version = Graph.adj.get(s).get(t).version;
        var new_ab = 0;
        var new_ba = 0;
        var alice = Graph.adj.get(s).get(t).alice;
        var bob = Graph.adj.get(s).get(t).bob;
        if (alice == s) {
            new_ab = Graph.adj.get(s).get(t).alice_balance - ether;
            new_ba = Graph.adj.get(s).get(t).bob_balance + ether;
        } else if (bob == s) {
            new_ab = Graph.adj.get(s).get(t).alice_balance + ether;
            new_ba = Graph.adj.get(s).get(t).bob_balance - ether;
        } else {
            console.log("channel error!!!");
        }
        updateEdgeInGraph(s, t, version, new_ab, new_ba);
    }
    mpc_tx_count++;
    if (mpc_tx_count % num_to_update_mpc == 0) {
        await MPC_OBJ.updateMPC(0, parties, txs, version);
    }
}


async function updateTPChannel(s, t, ether, parties) {
    // console.log("updateChannel : ", s, t, ether, parties);
    Graph.adj.get(s).get(t).version += 1;
    var version = Graph.adj.get(s).get(t).version;
    var channel_id = Graph.adj.get(s).get(t).channel_id;
    var new_ab = 0;
    var new_ba = 0;
    var alice = Graph.adj.get(s).get(t).alice;
    var bob = Graph.adj.get(s).get(t).bob;
    if (alice == s) {
        new_ab = Graph.adj.get(s).get(t).alice_balance - ether;
        new_ba = Graph.adj.get(s).get(t).bob_balance + ether;
    } else if (bob == s) {
        new_ab = Graph.adj.get(s).get(t).alice_balance + ether;
        new_ba = Graph.adj.get(s).get(t).bob_balance - ether;
    } else {
        console.log("channel error!!!");
    }
    tpc_tx_count++;
    if (tpc_tx_count % num_to_update_tpc == 0) {
        console.log("tpc_tx_count = ", tpc_tx_count);
        await TPC_OBJ.updateChannel(channel_id, parties[alice], parties[bob], new_ab.toString(), new_ba.toString(), version);
    }
    updateEdgeInGraph(s, t, version, new_ab, new_ba);
}

function updateEdgeInGraph(s, t, version, new_ab, new_ba) {
    Graph.adj.get(s).get(t).version = version;
    Graph.adj.get(s).get(t).alice_balance = new_ab;
    Graph.adj.get(s).get(t).bob_balance = new_ba;
}

async function executeTx_TPC(transactions, parties) {
    for (var i in transactions) {
        var t = transactions[i];
        var src = t[0];
        var dst = t[1];
        var ether = parseInt(t[2]);
        var path = await getPath(parties, src, dst);
        for (var j = 0; j < path.length - 1; j++) {
            var s = path[j];
            var t = path[j + 1];
            await updateTPChannel(s, t, ether, parties);
        }
    }
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

    var DP = new DirectedPay(parties, web3);
    
    var version = 1;
    for (var i = 0; i < transaction_count; i++) {
        var t = await generateTransactions(parties);
         // payment through n-TPC
        await executeTx_TPC(t.transactions, parties);
        // payment through MPC
        // await executeTx_MPC(t.revisedTxs, genTx(t.revisedTxs, accounts), parties, version);
        version += 1;
        // payment through Ethererum
        // await DP.run(t.transactions);
    }

    // balance test
    // var id_01 = Graph.adj.get(0).get(1).channel_id;
    // var id_12 = Graph.adj.get(1).get(2).channel_id;
    // var id_13 = Graph.adj.get(1).get(3).channel_id;
    // var id_24 = Graph.adj.get(2).get(4).channel_id;
    // await TPC_OBJ.getChannel(id_01);
    // await TPC_OBJ.getChannel(id_12);
    // await TPC_OBJ.getChannel(id_13);
    // await TPC_OBJ.getChannel(id_24);
    console.log("simulation end...");
}



(async function run(){
    await simulation();
    // sleep.sleep(3);
    // if (wsProvider.connected) {
    //     wsProvider.disconnect();
    // }
 })();