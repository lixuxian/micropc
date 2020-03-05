var Web3 = require('web3');  // 导入web3模块
var fs = require('fs');    // fs模块读取.sol合约文件
const abi = require('ethereumjs-abi');
var TPC = require('./TPC');
var MPC = require('./MPC');

// var channelLogger = logger.channelLogger;
// 通过web3连接私有链。 (web3通过geth连接区块链中的结点)
var opt = { timeout: 3600000 };
wsProvider = new Web3.providers.WebsocketProvider("ws://localhost:8549", opt);
var web3 = new Web3(wsProvider);  // s通过geth连接私有链中的结点

var tx_amount = 100;
var tx_time_sum = 0;

(async function test(){
    var accounts = await web3.eth.getAccounts();
    var alice = accounts[5];
    var bob = accounts[6];
    var ether = '1';
    var weis = web3.utils.toWei(ether, 'ether');
    for (var i = 0; i < tx_amount; i++) {
        var start = process.uptime();
        await web3.eth.sendTransaction({
            "from": alice,
            "to": bob,
            "value": weis
        })
        .on('receipt', function(receipt){
            console.log("Traditional transfer gasUsed: ", receipt.gasUsed);
        })
        .on('error', function(error) {
            console.log("Tradition run error: ", error);
        })
        var end = process.uptime();
        var tx_time = end - start;
        console.log("time = ", tx_time);
        tx_time_sum += tx_time;
    }
    console.log("total time for ", tx_amount, " tx: ", tx_time_sum);
})();