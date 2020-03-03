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
var web3 = new Web3(wsProvider);  // s通过geth连接私有链中的结点

var mpc_contract_abi = JSON.parse(fs.readFileSync("./build/contracts_MultipartyChannel_sol_MultipartyChannel.abi"));  // 读取编译合约的abi文件。
const mpc_address = '0x93B9B41cA16896325A64e49eeb90EEaF07D35E16';
const mpc_contract = new web3.eth.Contract(mpc_contract_abi, mpc_address);

var TPC_OBJ = new TPC(mpc_contract, web3);
var MPC_OBJ = new MPC(mpc_contract, web3);

const net = require( 'net' );
const port = 8000;
const hostname = '127.0.0.1';

// var accounts = await web3.eth.getAccounts();
var alice;
var bob;

// 定义两个变量， 一个用来计数，一个用来保存客户端
let clients = {};
let clientName = 0;

async function processCreateTPC(alice, bob, ab, bb, bobSig) {
  console.log("processCreateTPC...");
  var va = web3.utils.toWei(ab, 'ether');
  var vb = web3.utils.toWei(bb, 'ether');
  
  const prefix = "create a TPC";
  const msgHash = web3.utils.soliditySha3(
      {t: 'string', v: prefix},
      {t: 'address', v: alice},
      {t: 'address', v: bob},
      {t: 'uint256', v: va},
      {t: 'uint256', v: vb}
  );
  var aliceSig = await TPC_OBJ.generateSignatures(msgHash, alice);
  await mpc_contract.methods.createTPC(alice, bob, va, vb, aliceSig, bobSig).send({
    from: alice,
    gas: 6721975
  })
  .on('receipt', function(receipt){
      gasLogger.info('createTPC gasUsed: ', receipt.gasUsed);
  })
  .on('error', function(error) {
      console.log("createTPC error: ", error);
  });

  await mpc_contract.methods.deposit(alice, bob).send({
    from: alice,
    value: va.toString(),
    gas: 6721975
  })
  .on('receipt', function(receipt){
      channel_id = receipt.events.TPCOpenSuccess.returnValues["id"];
      console.log('alice deposit gasUsed: ', receipt.gasUsed);
      console.log("alice channel id : ", channel_id);
  })
  .on('error', function(error) {
      console.log("alice deposit error: ", error);
  });
}

function processUpdateTPC(alice, bob, new_ab, new_ba, bob_hash) {
  console.log("processUpdateTPC");
}

(async function serverRun() {
  var accounts = await web3.eth.getAccounts();
  alice = accounts[5];
  bob = accounts[6];
    // 创建服务器
  const server = new net.createServer();

  server.on('connection', (client) => {
    client.name = ++clientName; // 给每一个client起个名
    clients[client.name] = client; // 将client保存在clients
    client.setEncoding = 'UTF-8';

    client.on('data', function (msg) { //接收client发来的信息
      console.log(`客户端${client.name}发来一个信息：${msg}`);
      var msg_arr = msg.toString().split(",");
      console.log("msg_arr = ", msg_arr);
      if (msg_arr[0] == 'create tpc') {
        // TODO
        var alice_balance = msg_arr[1];
        var bob_balance = msg_arr[2];
        var bob_hash = msg_arr[3];
        if (alice_balance != bob_balance) {
          client.write('reject creat tpc');
        }
        else {
          client.write("agree create tpc");
          processCreateTPC(alice, bob, alice_balance, bob_balance, bob_hash);
        }
      }
      else if (msg_arr[0] == 'created') {
        var channel_id = msg_arr[1].toString();
        console.log("created, channedl id = ", channel_id);
      }
    });

    client.on('error', function (e) { //监听客户端异常
      console.log('client error' + e);
      client.end();
    });

    client.on( 'close', function () {
      delete clients[client.name];
      console.log(`客户端${ client.name }下线了`);
    });

  });

  server.listen( port,hostname,function () {
    console.log(`服务器运行在：http://${hostname}:${port}`);
  });
})();

// (async function run(){
//   await simulation();
//   sleep.sleep(3);
//   if (wsProvider.connected) {
//       wsProvider.disconnect();
//   }
// })();