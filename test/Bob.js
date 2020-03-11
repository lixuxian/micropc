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
// var channelLogger = logger.channelLogger;
// 通过web3连接私有链。 (web3通过geth连接区块链中的结点)
var opt = { timeout: 3600000 };
wsProvider = new Web3.providers.WebsocketProvider("ws://localhost:8549", opt);
var web3 = new Web3(wsProvider);  // s通过geth连接私有链中的结点

var mpc_contract_abi = JSON.parse(fs.readFileSync("./build/contracts_MultipartyChannel_sol_MultipartyChannel.abi"));  // 读取编译合约的abi文件。
const mpc_address = '0x93B9B41cA16896325A64e49eeb90EEaF07D35E16';
const mpc_contract = new web3.eth.Contract(mpc_contract_abi, mpc_address);

var TPC_OBJ = new TPC(mpc_contract, web3);
var MPC_OBJ = new MPC(mpc_contract, web3);


class AB_TPC {
  constructor(contract, web3) {
    this.whoami = "tpc between alice and bob";
    this.channel_id = 0;
    this.alice;
    this.bob;
    this.init_ab;
    this.init_bb;
    this.now_ab;
    this.now_bb;
    this.version = 0;
    this.created = false;
    this.aliceSig;
    this.bobSig;
  }

  printTPC() {
    console.log("TPC: ", this.now_ab, " <--> ", this.now_bb, " version ", this.version); 
  }
}

var ab_tpc = new AB_TPC();

const net = require('net');
const socket = new net.Socket();
const port = 8000;
const hostname = '127.0.0.1';
socket.setEncoding = 'UTF-8';

var init_ab = "200";
var init_bb = "200";
var init_va = web3.utils.toWei(init_ab, 'ether');
var init_vb = web3.utils.toWei(init_bb, 'ether');

var create_start;
var create_end;

async function requestCreateTPC()
{
  console.log("requestCreateTPC...");
  console.log("alice = ", alice, " bob = ", bob);
  var msg = 'create tpc,' + alice + ',' + bob + ',' + init_ab + ',' + init_bb + ',';

  const prefix = "create a TPC";
  const msgHash = web3.utils.soliditySha3(
      {t: 'string', v: prefix},
      {t: 'address', v: alice},
      {t: 'address', v: bob},
      {t: 'uint256', v: init_va},
      {t: 'uint256', v: init_vb}
  );
  var bobSig = await TPC_OBJ.generateSignatures(msgHash, bob);
  ab_tpc.bobSig = bobSig;
  msg += bobSig;
  socket.write(msg);
}

var ab_channel_id;

async function requestUpdateTPCLocally()
{
  update_start = process.uptime();
  console.log("requestUpdateTPCLocally...");
  var channel_id = ab_channel_id;
  var new_ab = (parseInt(ab_tpc.now_ab) + 1).toString();
  var new_bb = (parseInt(ab_tpc.now_bb) - 1).toString();
  var version = ab_tpc.version + 1;
  console.log("request new balance: ", new_ab, " <--> ", new_bb, " version: ", version);
  var msg = 'update tpc locally,' + channel_id.toString() + ',' + new_ab + ',' + new_bb + ',' + version.toString() + ',';

  var new_ab_wei = web3.utils.toWei(new_ab, 'ether');
  var new_ba_wei = web3.utils.toWei(new_bb, 'ether');

  const msgHash = web3.utils.soliditySha3(
      {t: 'address', v: alice},
      {t: 'address', v: bob},
      {t: 'uint256', v: channel_id},
      {t: 'uint256', v: new_ab_wei},
      {t: 'uint256', v: new_ba_wei},
      {t: 'uint256', v: version}
  );
  var bobSig = await TPC_OBJ.generateSignatures(msgHash, bob);
  msg += bobSig;
  socket.write(msg);
}

var update_sc_start;
var update_sc_end;

async function requestUpdateTPC()
{
  update_sc_start = process.uptime();
  console.log("requestUpdateTPC...");
  var msg = 'update tpc,' + ab_tpc.channel_id + ',' + ab_tpc.alice + ',' + ab_tpc.bob + ',' + ab_tpc.now_ab + ',' + ab_tpc.now_bb + ',' + ab_tpc.version + ',';

  var now_ab_wei = web3.utils.toWei(ab_tpc.now_ab, 'ether');
  var now_bb_wei = web3.utils.toWei(ab_tpc.now_bb, 'ether');

  const msgHash = web3.utils.soliditySha3(
    {t: 'address', v: ab_tpc.alice},
    {t: 'address', v: ab_tpc.bob},
    {t: 'uint256', v: ab_tpc.channel_id},
    {t: 'uint256', v: now_ab_wei},
    {t: 'uint256', v: now_bb_wei},
    {t: 'uint256', v: ab_tpc.version}
  );
  var bobSig = await TPC_OBJ.generateSignatures(msgHash, bob);
  msg += bobSig;
  socket.write(msg);
}

var close_start;
var close_end;

async function requestCloseTPC() 
{
  close_start = process.uptime();
  console.log("requestCloseTPC...");
  var msg = 'close tpc,' + ab_tpc.channel_id + ',' + ab_tpc.version + ',';

  const prefix = "close the TPC";
  const msgHash = web3.utils.soliditySha3(
      {t: 'string', v: prefix},
      {t: 'uint256', v: ab_tpc.channel_id},
      {t: 'uint256', v: ab_tpc.version}
  );
  var bobSig = await TPC_OBJ.generateSignatures(msgHash, bob);
  msg += bobSig;
  socket.write(msg);
}


var alice;
var bob;

async function depositBob(id) {
  await mpc_contract.methods.deposit(id, alice, bob).send({
    from: bob,
    value: init_va.toString(),
    gas: 6721975
  })
  .on('receipt', async function(receipt){
    var channel_id = 0;
    if (receipt.events) {
      if (receipt.events.TPCOpenSuccess) {
        channel_id = receipt.events.TPCOpenSuccess.returnValues["id"];
      }
      else if(receipt.events.TPCSomeDeposit) {
        console.log("bob deposite");
      }
    }
    gasLogger.info('bob deposit gasUsed: ', receipt.gasUsed);
    console.log('bob deposit gasUsed: ', receipt.gasUsed);
    if (channel_id > 0) {
      console.log("bob channel id : ", channel_id);
      var msg_created = "created," + channel_id.toString();
      ab_channel_id = channel_id;
      socket.write(msg_created);
      ab_tpc.channel_id = channel_id;
      ab_tpc.created = true;
      ab_tpc.version = 0;
      // start = process.uptime();
      // console.log("start = ", update_start);
      create_end= process.uptime();
      console.log("create TPC time: ", create_end - create_start);
      await requestUpdateTPCLocally();
    }
  })
  .on('error', function(error) {
      console.log("bob deposit error: ", error);
  });
}

var update_start;
var update_end;

var update_count = 0;
var update_time_sum = 0;
var tx_amount = 1;

(async function clientRun() {
  var accounts = await web3.eth.getAccounts();
  alice = accounts[5];
  bob = accounts[6];

  ab_tpc.alice = alice;
  ab_tpc.bob = bob;
  ab_tpc.init_ab = init_ab;
  ab_tpc.init_bb = init_bb;
  ab_tpc.now_ab = init_ab;
  ab_tpc.now_bb = init_bb;
  ab_tpc.version = 0;


  socket.connect( port,hostname,async function(){
    create_start = process.uptime();
    await requestCreateTPC();
  });

  socket.on( 'data', async function ( msg ) {
    // console.log( msg.toString() );
    var msg_arr = msg.toString().split(",");
    if (msg_arr[0] == 'agree create tpc') {
      depositBob(parseInt(msg_arr[1]));
    }
    else if (msg_arr[0] == 'created') {
      var channel_id = msg_arr[1].toString();
      console.log("created, channel id = ", channel_id);
      ab_tpc.created = true;
      ab_tpc.channel_id = channel_id;
      ab_tpc.aliceSig = msg_arr[2];
      create_end= process.uptime();
      console.log("create TPC time: ", create_end - create_start);
    }
    else if (msg_arr[0] == 'updated locally') {
      update_end = process.uptime();
      console.log("end = ", update_end);
      ab_tpc.channel_id = parseInt(msg_arr[1]);
      ab_tpc.now_ab = msg_arr[2];
      ab_tpc.now_bb = msg_arr[3];
      ab_tpc.version = parseInt(msg_arr[4]);
      ab_tpc.aliceSig = msg_arr[5];
      ab_tpc.bobSig = msg_arr[6];
      ab_tpc.printTPC();
      console.log("receive updated locally");
      var update_time = update_end - update_start
      console.log("update locally time = ", update_time);
      update_count++;
      update_time_sum += update_time;
      if (update_count < tx_amount) {
        requestUpdateTPCLocally();
      }
      else
      {
        console.log("total update time for ", tx_amount, " tx: ", update_time_sum);
        await requestUpdateTPC();
      }
    }
    else if (msg_arr[0] == 'updated') {
      update_sc_end = process.uptime();
      var update_sc_time = update_sc_end - update_sc_start;
      console.log("update_sc_time = ", update_sc_time);
      ab_tpc.channel_id = parseInt(msg_arr[1]);
      ab_tpc.now_ab = msg_arr[4];
      ab_tpc.now_bb = msg_arr[5];
      ab_tpc.version = parseInt(msg_arr[6]);
      ab_tpc.aliceSig = msg_arr[7];
      ab_tpc.bobSig = msg_arr[8];
      ab_tpc.printTPC();
      await requestCloseTPC();
    }
    else if (msg_arr[0] == 'closed') {
      close_end = process.uptime();
      var close_time = close_end - close_start;
      console.log("close TPC time: ", close_time);
      var channel_id = parseInt(msg_arr[1]);
      var version = parseInt(msg_arr[2]);
      console.log("closed channel ", channel_id, " version ", version);
    }
  });

  socket.on( 'error', function ( error ) {
    console.log( 'error' + error );
  });

  socket.on('close',function(){
    console.log('服务器端下线了');
  });
})();
