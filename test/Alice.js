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
// const tpc_contract = mpc_contract;
var TPC_OBJ = new TPC(mpc_contract, web3);
var MPC_OBJ = new MPC(mpc_contract, web3);

const net = require( 'net' );
const port = 8000;
const hostname = '127.0.0.1';

// var accounts = await web3.eth.getAccounts();
var alice;
var bob;
var init_ab; // string
var init_bb;

// 定义两个变量， 一个用来计数，一个用来保存客户端
let clients = {};
let clientName = 0;

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

async function processCreateTPC(client, alice, bob, ab, bb, bobSig) {
  console.log("processCreateTPC...");
  var va = web3.utils.toWei(ab, 'ether');
  var vb = web3.utils.toWei(bb, 'ether');
  
  const prefix = "create a TPC";
  // console.log("processCreateTPC alice = ", alice, " bob = ", bob);
  const msgHash = web3.utils.soliditySha3(
      {t: 'string', v: prefix},
      {t: 'address', v: alice},
      {t: 'address', v: bob},
      {t: 'uint256', v: va},
      {t: 'uint256', v: vb}
  );
  var aliceSig = await TPC_OBJ.generateSignatures(msgHash, alice);
  ab_tpc.aliceSig = aliceSig;
  var id = 0;
  await mpc_contract.methods.createTPC(alice, bob, va, vb, aliceSig, bobSig).send({
    from: alice,
    gas: 6721975
  })
  .on('receipt', function(receipt){
      gasLogger.info('createTPC gasUsed: ', receipt.gasUsed);
      console.log('createTPC gasUsed: ', receipt.gasUsed);
      if (receipt.events && receipt.events.TPCOpenRequest) {
        id = receipt.events.TPCOpenRequest.returnValues["id"];
        console.log("tpc id = ", id);
      }
  })
  .on('error', function(error) {
      console.log("createTPC error: ", error);
  });

  await mpc_contract.methods.deposit(id, alice, bob).send({
    from: alice,
    value: va.toString(),
    gas: 6721975
  })
  .on('receipt', function(receipt){
    if (receipt.events) {
      var channel_id = 0;
      if (receipt.events.TPCOpenSuccess) {
        channel_id = receipt.events.TPCOpenSuccess.returnValues["id"];
      }
      else if (receipt.events.TPCOpenSuccess) {
        console.log("alice deposite");
      }
      if (channel_id > 0) {
        console.log("alice channel id : ", channel_id);
        var msg_created = "created," + channel_id.toString() + "," + aliceSig;
        ab_tpc.channel_id = channel_id;
        ab_tpc.alice = alice;
        ab_tpc.bob = bob;
        ab_tpc.init_ab = ab;
        ab_tpc.init_bb = bb;
        ab_tpc.now_ab = ab;
        ab_tpc.now_bb = bb;
        ab_tpc.version = 0;
        ab_tpc.created = true;
        ab_tpc.aliceSig = aliceSig;
        ab_tpc.bobSig = bobSig;
        ab_tpc.printTPC();
        client.write(msg_created);
      }
      gasLogger.info('alice deposit gasUsed: ', receipt.gasUsed);
      console.log('alice deposit gasUsed: ', receipt.gasUsed);
    } else {
      console.log("alice deposite no events");
    }
  })
  .on('error', function(error) {
      console.log("alice deposit error: ", error);
  });
  return id;
}

async function processUpdateTPCLocally(client, channel_id, alice, bob, new_ab, new_bb, version, bobSig) {
  console.log("processUpdateTPCLocally...");
  console.log("new balance: ", new_ab, " <--> ", new_bb, " version: ", version);
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

  var aliceSig = await TPC_OBJ.generateSignatures(msgHash, alice);
  var bobSig_check = await TPC_OBJ.generateSignatures(msgHash, bob);
  if (bobSig == bobSig_check) {
    var msg = "updated locally," + channel_id.toString() + "," + new_ab + "," + new_bb + "," + version.toString() + "," + aliceSig + "," + bobSig;
    client.write(msg);
    ab_tpc.now_ab = new_ab;
    ab_tpc.now_bb = new_bb;
    ab_tpc.version = version;
    ab_tpc.printTPC();
  }
  else {
    console.log("processUpdateTPC: bobSig error!");
    client.write("reject update");
    return;
  }
}

async function processUpdateTPC(client, channel_id, alice, bob, new_ab, new_bb, version, bobSig) {
  console.log("processUpdateTPC...");
  if (version >= ab_tpc.version && (parseInt(new_ab) + parseInt(new_bb) == parseInt(ab_tpc.now_ab) + parseInt(ab_tpc.now_bb)))
  {
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

    var aliceSig = await TPC_OBJ.generateSignatures(msgHash, alice);
    var bobSig_check = await TPC_OBJ.generateSignatures(msgHash, bob);
    if (bobSig == bobSig_check) {
      await mpc_contract.methods.updateTPC(channel_id, alice, bob, new_ab_wei, new_ba_wei, version, aliceSig, bobSig)
      .send({
          from: alice,
          gas: 672197500
      }) 
      .on('receipt', function(receipt){
          var update_channel_id = receipt.events.TPCUpdateSuccess.returnValues["id"];
          console.log("update channel ", update_channel_id);
          gasLogger.info('updateTPC gasUsed: ', receipt.gasUsed);
          console.log('updateTPC gasUsed: ', receipt.gasUsed);
          ab_tpc.now_ab = new_ab;
          ab_tpc.now_bb = new_bb;
          ab_tpc.version = version;
          var msg = 'updated,' + update_channel_id.toString() + ',' + ab_tpc.alice + ',' + ab_tpc.bob + ',' + ab_tpc.now_ab + ',' 
            + ab_tpc.now_bb + ',' + ab_tpc.version.toString() + ',' + aliceSig + ',' + bobSig;
          client.write(msg);
      })
      .on('error', function(error) {
          console.log("updateTPC error: ", error);
      });
    }
    else {
      console.log("processUpdateTPC: bobSig error!");
      client.write("reject update tpc");
      return;
    }
  }
  else {
    console.log("processUpdateTPC: verify failed!");
    client.write("reject update tpc");
  }
}

async function processCloseTPC(client, channel_id, version, bobSig) {
  console.log("processCloseTPC...");
  if (version == ab_tpc.version && channel_id == ab_tpc.channel_id)
  {
    console.log("going to close channel ", channel_id, " version ", version);
    const prefix = "close the TPC";
    const msgHash = web3.utils.soliditySha3(
        {t: 'string', v: prefix},
        {t: 'uint256', v: channel_id},
        {t: 'uint256', v: version}
    );
    var aliceSig = await TPC_OBJ.generateSignatures(msgHash, ab_tpc.alice);
    var bobSig_check = await TPC_OBJ.generateSignatures(msgHash, ab_tpc.bob);
    if (bobSig == bobSig_check) {
      await mpc_contract.methods.closeTPC(channel_id, version, aliceSig, bobSig)
        .send({
            from: ab_tpc.alice,
            gas: 672197500
        }) 
        .on('receipt', function(receipt){
            // gasLogger.info('closeTPC gasUsed: ', receipt.gasUsed);
            // console.log("closeTPC event: ", receipt.events.TPCCloseChannel);
            console.log('closeTPC gasUsed: ', receipt.gasUsed);
            var msg = "closed," + channel_id.toString() + "," + version.toString() + "," + aliceSig + "," + bobSig;
            client.write(msg);
        })
        .on('error', function(error) {
            console.log("closeTPC error: ", error);
        });
    }
    else {
      console.log("processCloseTPC: bobSig error!");
      client.write("reject close tpc");
      return;
    }
  }
  else {
    console.log("processCloseTPC: verify failed!");
    client.write("reject close tpc");
  }
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

    client.on('data', async function (msg) { //接收client发来的信息
      console.log(`客户端${client.name}发来一个信息：${msg}`);
      var msg_arr = msg.toString().split(",");
      console.log("msg_arr = ", msg_arr);
      if (msg_arr[0] == 'create tpc') {
        var alice = msg_arr[1];
        var bob = msg_arr[2];
        var alice_balance = msg_arr[3];
        var bob_balance = msg_arr[4];
        var bobSig = msg_arr[5];
        // init_ab = alice_balance;
        // init_bb = bob_balance;
        // ab_tpc.channel_id = channel_id;
        ab_tpc.alice = alice;
        ab_tpc.bob = bob;
        ab_tpc.init_ab = alice_balance;
        ab_tpc.init_bb = bob_balance;
        ab_tpc.now_ab = alice_balance;
        ab_tpc.now_bb = bob_balance;
        ab_tpc.version = 0;
        ab_tpc.created = false;
        ab_tpc.bobSig = bobSig;
        if (alice_balance != bob_balance) {
          client.write('reject creat tpc');
        }
        else {
          var id = await processCreateTPC(client, alice, bob, alice_balance, bob_balance, bobSig);
          client.write("agree create tpc," + id.toString());
        }
      }
      else if (msg_arr[0] == 'created') {
        var channel_id = msg_arr[1].toString();
        console.log("created, channel id = ", channel_id);
        ab_tpc.created = true;
        ab_tpc.channel_id = channel_id;
      }
      else if (msg_arr[0] == 'update tpc locally') {
        if (ab_tpc.created == false) {
          client.write("reject update locally, not created now");
        }
        else {
          var channel_id = parseInt(msg_arr[1]);
          var new_ab = msg_arr[2];
          var new_bb = msg_arr[3];
          var version = parseInt(msg_arr[4]);
          var bobSig = msg_arr[5];
          await processUpdateTPCLocally(client, channel_id, ab_tpc.alice, ab_tpc.bob, new_ab, new_bb, version, bobSig);
        }
      }
      else if (msg_arr[0] == 'update tpc') {
          var channel_id = parseInt(msg_arr[1]);
          var alice = msg_arr[2];
          var bob = msg_arr[3];
          var new_ab = msg_arr[4];
          var new_bb = msg_arr[5];
          var version = parseInt(msg_arr[6]);
          var bobSig = msg_arr[7];
          await processUpdateTPC(client, channel_id, alice, bob, new_ab, new_bb, version, bobSig);
      }
      else if (msg_arr[0] == 'close tpc') {
        var channel_id = parseInt(msg_arr[1]);
        var version = parseInt(msg_arr[2]);
        var bobSig = msg_arr[3];
        await processCloseTPC(client, channel_id, version, bobSig);
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
