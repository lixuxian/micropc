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

const net = require('net');
const socket = new net.Socket();
const port = 8000;
const hostname = '127.0.0.1';
socket.setEncoding = 'UTF-8';

var ab = "100";
var bb = "100";
var va = web3.utils.toWei(ab, 'ether');
var vb = web3.utils.toWei(bb, 'ether');

async function requestCreateTPC()
{
  console.log("requestCreateTPC...");
  console.log("alice = ", alice, " bob = ", bob);
  var msg = 'create tpc,' + ab + ',' + bb + ',';

  const prefix = "create a TPC";
  const msgHash = web3.utils.soliditySha3(
      {t: 'string', v: prefix},
      {t: 'address', v: alice},
      {t: 'address', v: bob},
      {t: 'uint256', v: va},
      {t: 'uint256', v: vb}
  );
  var bobSig = await TPC_OBJ.generateSignatures(msgHash, bob);
  msg += bobSig;
  socket.write(msg);
}

var alice;
var bob;

async function depositBob() {
  await mpc_contract.methods.deposit(alice, bob).send({
    from: bob,
    value: va.toString(),
    gas: 6721975
  })
  .on('receipt', function(receipt){
    channel_id = receipt.events.TPCOpenSuccess.returnValues["id"];
    console.log('bob deposit gasUsed: ', receipt.gasUsed);
    console.log("bob channel id : ", channel_id);
    if (channel_id > 0) {
      var msg_created = "created," + channel_id.toString();
      socket.write(msg_created);
    }
  })
  .on('error', function(error) {
      console.log("bob deposit error: ", error);
  });
}

(async function clientRun() {
  var accounts = await web3.eth.getAccounts();
  alice = accounts[5];
  bob = accounts[6];

  socket.connect( port,hostname,async function(){
    await requestCreateTPC();
  });

  socket.on( 'data', async function ( msg ) {
    console.log( msg.toString() );
    var msg_arr = msg.toString().split(",");
    if (msg_arr[0] == 'agree create tpc') {
      depositBob();
    }
  });

  socket.on( 'error', function ( error ) {
    console.log( 'error' + error );
  });

  socket.on('close',function(){
    console.log('服务器端下线了');
  });
})();
