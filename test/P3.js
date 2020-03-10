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
const port = 8001;
const hostname = '127.0.0.1';

// var accounts = await web3.eth.getAccounts();
var p2;
var p1;
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
    console.log("TPC ", this.channel_id, this.now_ab, " <--> ", this.now_bb, " version ", this.version); 
  }
}

var tpc_12 = new AB_TPC();
var tpc_13 = new AB_TPC();

var init_balance = "200";
var init_balance_wei = web3.utils.toWei(init_balance, 'ether');


async function processCreateTPC(client, alice, bob, ab, bb, p1Sig) {
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
  var bobSig = await TPC_OBJ.generateSignatures(msgHash, bob);
  tpc_12.bobSig = bobSig;
  var tmp_channel_id = 0;
  await mpc_contract.methods.createTPC(alice, bob, va, vb, p1Sig, bobSig).send({
    from: bob,
    gas: 6721975
  })
  .on('receipt', function(receipt){
    //   gasLogger.info('createTPC gasUsed: ', receipt.gasUsed);
        tmp_channel_id = receipt.events.TPCOpenRequest.returnValues["id"];
        var msg = "agree create tpc,p3," + tmp_channel_id.toString();
        client.write(msg);
        console.log('createTPC gasUsed: ', receipt.gasUsed);
  })
  .on('error', function(error) {
        console.log("createTPC error: ", error);
  });

  await mpc_contract.methods.deposit(tmp_channel_id, alice, bob).send({
    from: bob,
    value: va.toString(),
    gas: 6721975
  })
  .on('receipt', function(receipt){
    if (receipt.events) {
      var channel_id = -1;
    //   console.log(receipt.events);
      if (receipt.events.TPCSomeDeposit) {
        console.log("bob deposite");
      }
      if (receipt.events.TPCOpenSuccess) {
        channel_id = receipt.events.TPCOpenSuccess.returnValues["id"];
      }
      
      if (channel_id > 0) {
        console.log("created channel id : ", channel_id);
        var msg_created = "created," + channel_id.toString() + "," + bobSig;
        tpc_12.channel_id = channel_id;
        tpc_12.alice = alice;
        tpc_12.bob = bob;
        tpc_12.init_ab = ab;
        tpc_12.init_bb = bb;
        tpc_12.now_ab = ab;
        tpc_12.now_bb = bb;
        tpc_12.version = 0;
        tpc_12.created = true;
        tpc_12.aliceSig = p1Sig;
        tpc_12.bobSig = bobSig;
        tpc_12.printTPC();
        client.write(msg_created);
      }
    //   gasLogger.info('alice deposit gasUsed: ', receipt.gasUsed);
      console.log('bob deposit gasUsed: ', receipt.gasUsed);
    } else {
      console.log("bob deposite no events");
    }
  })
  .on('error', function(error) {
      console.log("bob deposit error: ", error);
  });
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
    tpc_12.now_ab = new_ab;
    tpc_12.now_bb = new_bb;
    tpc_12.version = version;
    tpc_12.printTPC();
  }
  else {
    console.log("processUpdateTPC: bobSig error!");
    client.write("reject update");
    return;
  }
}

async function processUpdateTPC(client, channel_id, alice, bob, new_ab, new_bb, version, bobSig) {
  console.log("processUpdateTPC...");
  if (version >= tpc_12.version && (parseInt(new_ab) + parseInt(new_bb) == parseInt(tpc_12.now_ab) + parseInt(tpc_12.now_bb)))
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
          tpc_12.now_ab = new_ab;
          tpc_12.now_bb = new_bb;
          tpc_12.version = version;
          var msg = 'updated,' + update_channel_id.toString() + ',' + tpc_12.alice + ',' + tpc_12.bob + ',' + tpc_12.now_ab + ',' 
            + tpc_12.now_bb + ',' + tpc_12.version.toString() + ',' + aliceSig + ',' + bobSig;
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
  if (version == tpc_12.version && channel_id == tpc_12.channel_id)
  {
    console.log("going to close channel ", channel_id, " version ", version);
    const prefix = "close the TPC";
    const msgHash = web3.utils.soliditySha3(
        {t: 'string', v: prefix},
        {t: 'uint256', v: channel_id},
        {t: 'uint256', v: version}
    );
    var aliceSig = await TPC_OBJ.generateSignatures(msgHash, tpc_12.alice);
    var bobSig_check = await TPC_OBJ.generateSignatures(msgHash, tpc_12.bob);
    if (bobSig == bobSig_check) {
      await mpc_contract.methods.closeTPC(channel_id, version, aliceSig, bobSig)
        .send({
            from: tpc_12.alice,
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

async function processMsg(client, msg) { //接收client发来的信息
    console.log(`客户端发来一个信息：${msg}`);
    var msg_arr = msg.toString().split(",");
    console.log("msg_arr = ", msg_arr);
    if (msg_arr[0] == 'create tpc') {
      var alice = msg_arr[1];
      var bob = msg_arr[2];
      var alice_balance = msg_arr[3];
      var bob_balance = msg_arr[4];
      var p1Sig = msg_arr[5];
      tpc_12.alice = alice;
      tpc_12.bob = bob;
      tpc_12.init_ab = alice_balance;
      tpc_12.init_bb = bob_balance;
      tpc_12.now_ab = alice_balance;
      tpc_12.now_bb = bob_balance;
      tpc_12.version = 0;
      tpc_12.created = false;
      tpc_12.aliceSig = p1Sig;
      if (alice_balance != bob_balance) {
        client.write('reject creat tpc');
      }
      else {
        // client.write("agree create tpc,p2");
        await processCreateTPC(client, alice, bob, alice_balance, bob_balance, p1Sig);
      }
    }
    else if (msg_arr[0] == 'created') {
      var channel_id = msg_arr[1].toString();
      console.log("created, channel id = ", channel_id);
      tpc_12.created = true;
      tpc_12.channel_id = channel_id;
    }
    else if (msg_arr[0] == 'update tpc locally') {
      if (tpc_12.created == false) {
        client.write("reject update locally, not created now");
      }
      else {
        var channel_id = parseInt(msg_arr[1]);
        var new_ab = msg_arr[2];
        var new_bb = msg_arr[3];
        var version = parseInt(msg_arr[4]);
        var p1Sig = msg_arr[5];
        await processUpdateTPCLocally(client, channel_id, tpc_12.alice, tpc_12.bob, new_ab, new_bb, version, p1Sig);
      }
    }
    else if (msg_arr[0] == 'update tpc') {
        var channel_id = parseInt(msg_arr[1]);
        var alice = msg_arr[2];
        var bob = msg_arr[3];
        var new_ab = msg_arr[4];
        var new_bb = msg_arr[5];
        var version = parseInt(msg_arr[6]);
        var p1Sig = msg_arr[7];
        await processUpdateTPC(client, channel_id, alice, bob, new_ab, new_bb, version, p1Sig);
    }
    else if (msg_arr[0] == 'close tpc') {
      var channel_id = parseInt(msg_arr[1]);
      var version = parseInt(msg_arr[2]);
      var p1Sig = msg_arr[3];
      await processCloseTPC(client, channel_id, version, p1Sig);
    }
    else if (msg_arr[0] == 'create mpc') {
      // const msg = "create mpc," + p1 + "," + p2 + "," + p3 + "," + p1Sig;
      const msgHash = await web3.utils.soliditySha3(
        {t: 'address', v: p3}
      );
      var p3Sig = await TPC_OBJ.generateSignatures(msgHash, p3);
      const msg = "agree create mpc,p3," + p3Sig;
      client.write(msg);
    }
    else if (msg_arr[0] == 'mpc created') {
      console.log("mpc created, id = ", msg_arr[1]);
    }
    else if (msg_arr[0] == 'update mpc locally') {
      var p1Sig = msg_arr[msg_arr.length - 1];
      var msg = "";
      for (var i = 0; i < msg_arr.length - 1; i++) {
        msg += msg_arr[i] + ",";
      }
      const msgHash = await web3.utils.soliditySha3(
        {t: 'string', v: msg}
      );
      var p1Sig_check = await TPC_OBJ.generateSignatures(msgHash, p1);
      if (p1Sig == p1Sig_check) {
        var p3Sig = await TPC_OBJ.generateSignatures(msgHash, p3);
        client.write("agree update mpc locally,p3," + p3Sig);
      }
      else {
        console.log("msg = ", msg);
        console.log("p1Sig_check = ", p1Sig_check);
        client.write("reject update mpc locally");
      }
    }
    else if (msg_arr[0] == 'update mpc') {
      var mpc_id = parseInt(msg_arr[1]);
      var txstr = msg_arr[2];
      var version = parseInt(msg_arr[3]);
      var p1Sig = msg_arr[4];
      const msgHash = await web3.utils.soliditySha3(
        {t: 'string', v: txstr},
        {t: 'address', v: p1},
        {t: 'uint256', v: version}
      );
      var p1Sig_check = await TPC_OBJ.generateSignatures(msgHash, p1);
      if (p1Sig == p1Sig_check) {
        const msgHash_3 = await web3.utils.soliditySha3(
          {t: 'string', v: txstr},
          {t: 'address', v: p3},
          {t: 'uint256', v: version}
        );
        var p3Sig = await TPC_OBJ.generateSignatures(msgHash_3, p3);
        client.write("agree update mpc,p3," + mpc_id.toString() + "," + p3Sig);
      }
      else {
        console.log("msg = ", msg);
        console.log("p1Sig_check = ", p1Sig_check);
        client.write("reject update mpc");
      }
  }
  }

var p1;
var p2;
var p3;
var thisAddr;

async function init() {
    var accounts = await web3.eth.getAccounts();
    p1 = accounts[1];
    p2 = accounts[2];
    p3 = accounts[3];
    thisAddr = p3;
    console.log("p1 = ", p1);
    console.log("p2 = ", p2);
    console.log("p3 = ", p3);

    tpc_12.alice = p1;
    tpc_12.bob = p2;
    tpc_12.init_ab = init_balance;
    tpc_12.init_bb = init_balance;
    tpc_12.now_ab = init_balance;
    tpc_12.now_bb = init_balance;
    tpc_12.version = 0;

    tpc_13.alice = p1;
    tpc_13.bob = p3;
    tpc_13.init_ab = init_balance;
    tpc_13.init_bb = init_balance;
    tpc_13.now_ab = init_balance;
    tpc_13.now_bb = init_balance;
    tpc_13.version = 0;
}

(async function serverRun() {
  await init();
    // 创建服务器
  const server = new net.createServer();

  server.on('connection', (client) => {
    client.name = ++clientName; // 给每一个client起个名
    clients[client.name] = client; // 将client保存在clients
    client.setEncoding = 'UTF-8';

    client.on('data', async function(msg) {
        await processMsg(client, msg);
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
