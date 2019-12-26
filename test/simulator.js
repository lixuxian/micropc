var Web3 = require('web3');  // 导入web3模块
var fs = require('fs');    // fs模块读取.sol合约文件
const abi = require('ethereumjs-abi');
var TPC = require('./TPC');
var MPC = require('./MPC');
var logger = require('./logger');
var Graph = require('./topo');

var gasLogger = logger.gasLogger;
var channelLogger = logger.channelLogger;
// 通过web3连接私有链。 (web3通过geth连接区块链中的结点)
wsProvider = new Web3.providers.WebsocketProvider("ws://localhost:8549");
var web3 = new Web3(wsProvider);  // 通过geth连接私有链中的结点。 
 
 
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
    var edges = Graph.edges();
    for (var id in edges) {
        var edge = edges[id];
        // console.log("edge: ", edge[0], " vs", edge[1]);
        var alice = accounts[edge[0]];
        var bob   = accounts[edge[1]];
        var channel_id = await TPC_OBJ.createChannel(alice, bob, '10', '10');
        Graph.adj.get(edge[0]).get(edge[1]).channel_id = channel_id;
        channelLogger.info("edge", edge[0], edge[1]);
    }
}

async function simulation() {
    channelLogger.info("simulation begin...");
    var accounts = await web3.eth.getAccounts();
    await createTopo(accounts);
    // console.log("accounts", accounts);
    // alice = accounts[1];
    // bob = accounts[2];
    // carol = accounts[3];
    
    // // create two simple payment channels of alice, bob and carol
    // console.log("alice: ", alice, " bob: ", bob, " carol: ", carol);
    // var ab_channel_id = await TPC_OBJ.createChannel(alice, bob, '10', '10');
    // console.log("alice <-> bob channel_id = ", ab_channel_id);

    // var bc_channel_id = await TPC_OBJ.createChannel(bob, carol, '10', '10');
    // console.log("bob <-> carol channel_id = ", bc_channel_id);

    // // create mpc
    // var parties = new Array(alice, bob, carol);
    // var channels_id = new Array(ab_channel_id, bc_channel_id);
    // await MPC_OBJ.createMPC(tpc_address, parties, channels_id);

    channelLogger.info("simulation end...");

    // // update test 1
    // var one_weis = web3.utils.toWei('1', 'ether');
    // var two_weis = web3.utils.toWei('2', 'ether');
    // var txs1 = [
    //     {
    //         "channel_id": ab_channel_id,
    //         "src": alice,
    //         "dst": bob,
    //         "weis": one_weis
    //     },
    //     {
    //         "channel_id": bc_channel_id,
    //         "src": bob,
    //         "dst": carol,
    //         "weis": two_weis
    //     }
    // ]

    // await MPC_OBJ.updateMPC(0, parties, txs1, 1);

    // // update test 2
    // var txs2 = [
    //     {
    //         "channel_id": ab_channel_id,
    //         "src": alice,
    //         "dst": bob,
    //         "weis": one_weis
    //     },
    //     {
    //         "channel_id": bc_channel_id,
    //         "src": bob,
    //         "dst": carol,
    //         "weis": one_weis
    //     },
    //     {
    //         "channel_id": bc_channel_id,
    //         "src": bob,
    //         "dst": carol,
    //         "weis": one_weis
    //     }
    // ]
    // await MPC_OBJ.updateMPC(0, parties, txs2, 2);

    // // check channel balance
    // await TPC_OBJ.getChannel(ab_channel_id);
    // await TPC_OBJ.getChannel(bc_channel_id);
    wsProvider.disconnect();
}

simulation();