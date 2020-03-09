var Web3 = require('web3');  // 导入web3模块
var fs = require('fs');    // fs模块读取.sol合约文件
const abi = require('ethereumjs-abi');
var TPC = require('./TPC');
var MPC = require('./MPC');
var logger = require('./logger');
var sleep = require('sleep');

var gasLogger = logger.gasLogger;
var opt = { timeout: 3600000 };
wsProvider = new Web3.providers.WebsocketProvider("ws://localhost:8549", opt);
var web3 = new Web3(wsProvider); 
var mpc_contract_abi = JSON.parse(fs.readFileSync("./build/contracts_MultipartyChannel_sol_MultipartyChannel.abi"));  // 读取编译合约的abi文件。
const mpc_address = '0x93B9B41cA16896325A64e49eeb90EEaF07D35E16';
const mpc_contract = new web3.eth.Contract(mpc_contract_abi, mpc_address);
var TPC_OBJ = new TPC(mpc_contract, web3);
var MPC_OBJ = new MPC(mpc_contract, web3);

// net config
const net = require('net');
// socket between P1 P2
const socket_12 = new net.Socket();
const port_12 = 8000;
const hostname = '127.0.0.1';
socket_12.setEncoding = 'UTF-8';

// socket between P1 P3
const socket_13 = new net.Socket();
const port_13 = 8001;
// const hostname = '127.0.0.1';
socket_13.setEncoding = 'UTF-8';

// parties
var p1;
var p2;
var p3;

// class for two-party payment channel
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
    console.log("TPC ", this.channel_id, " : ", this.now_ab, " <--> ", this.now_bb, " version ", this.version,
    this.created); 
  }
}

var tpc_12 = new AB_TPC(); // tpc between p1 p2
var tpc_13 = new AB_TPC(); // tpc between p1 p3


var init_balance = "200";
var init_balance_wei = web3.utils.toWei(init_balance, 'ether');

async function requestCreateTPC(socket, tpc, alice, bob) // p1, p2/p3
{
  console.log("requestCreateTPC...");
  console.log("alice = ", alice, " bob = ", bob);
  var msg = 'create tpc,' + alice + ',' + bob + ',' + init_balance + ',' + init_balance + ',';

  const prefix = "create a TPC";
  const msgHash = web3.utils.soliditySha3(
      {t: 'string', v: prefix},
      {t: 'address', v: alice},
      {t: 'address', v: bob},
      {t: 'uint256', v: init_balance_wei},
      {t: 'uint256', v: init_balance_wei}
  );
  var p1Sig = await TPC_OBJ.generateSignatures(msgHash, p1);
  tpc.aliceSig = p1Sig;
  msg += p1Sig;
  socket.write(msg);
}

async function requestCreateMPC(socket_12, socket_13, p1, p2, p3) {
  console.log("requestCreateMPC...");
  var msg = "create mpc," + p1 + "," + p2 + "," + p3 + ",";
  const msgHash_1 = await web3.utils.soliditySha3(
    {t: 'address', v: p1}
  );
  var p1Sig = await TPC_OBJ.generateSignatures(msgHash_1, p1);
  agreeCreateP1Sig = p1Sig;
  msg += p1Sig;
  socket_12.write(msg);
  socket_13.write(msg);
}

var agreeCreateP2 = false;
var agreeCreateP3 = false;
var agreeCreateP1Sig;
var agreeCreateP2Sig;
var agreeCreateP3Sig;

var mpc_id = 0;

async function processCreateMPC(p, sig) {
  if (p == 'p2') {
    agreeCreateP2 = true;
    agreeCreateP2Sig = sig;
  }
  else if (p == 'p3') {
    agreeCreateP3 = true;
    agreeCreateP3Sig = sig;
  }
  if (agreeCreateP2 && agreeCreateP3) {
    // await this.mpc_contract.methods.createMPC(parties, sigs, channels_id)
    var parties = new Array();
    parties.push(p1, p2, p3);
    var sigs = new Array();
    sigs.push(agreeCreateP1Sig, agreeCreateP2Sig, agreeCreateP3Sig);
    var channels = new Array();
    channels.push(tpc_12.channel_id, tpc_13.channel_id);

    await mpc_contract.methods.createMPC(parties, sigs, channels)
    .send( {
        from: p1,
        gas: 672197500
    })
    .on('receipt', async function(receipt){
        mpc_id = receipt.events.MPCCreateSuccess.returnValues["id"];
        console.log("createMPC gasUsed: ", receipt.gasUsed);
        var msg = "mpc created," + mpc_id.toString() + "," + agreeCreateP1Sig + "," + agreeCreateP2Sig + "," + agreeCreateP3Sig;
        socket_12.write(msg);
        socket_13.write(msg);
        
        mpc = new MPTX(tpc_12, tpc_13);
        mpc.printTPC();

        var tx_1 = new Tx(tpc_12.channel_id, p2, p1, 1);
        var tx_2 = new Tx(tpc_13.channel_id, p1, p3, 2);
        var mptx = new Array();
        mptx.push(tx_1, tx_2);
        await requestUpdateMPCLocally(mptx);
        mpc.printTPC();
    })
    .on('error', function(error) {     
        console.log("createMPC error: ", error);
    });
  }
}


class Tx {
  constructor(id, src, dst, ether) {
    this.id = id;
    this.src = src; // address
    this.dst = dst; // address
    this.ether = ether;
    this.weis = web3.utils.toWei(ether.toString(), 'ether');
  }
}

var mpc;

class MPTX {
  constructor(tpc_12, tpc_13) {  
    this.tpc_map = new Map();
    this.tpc_map.set(tpc_12.channel_id, tpc_12);
    this.tpc_map.set(tpc_13.channel_id, tpc_13);
    // this.printTPC();
  }

  printTPC() {
    for (var [key, value] of this.tpc_map) {
      console.log("channel id:", key, " ab: ", value.now_ab, " bb: ", value.now_bb);
    } 
  }

  addTx(tx) {
    // console.log("addTx: tx.id = ", tx.id);
    var tpc = this.tpc_map.get(tx.id);
    // console.log("addTx: tpc = ", tpc);
    if (tx.src == tpc.alice) {
      tpc.now_ab = (parseInt(tpc.now_ab) - tx.ether).toString();
      tpc.now_bb = (parseInt(tpc.now_bb) + tx.ether).toString();
    }
    else if (tx.src == tpc.bob) {
      tpc.now_ab = (parseInt(tpc.now_ab) + tx.ether).toString();
      tpc.now_bb = (parseInt(tpc.now_bb) - tx.ether).toString();
    }
    else {
      console.log("addTx: Error src");
    }
  }

  genMptx() {
    var txs;
    for (var [key, value] of this.tpc_map) {
      // console.log("channel id:", value.channel_id, " ab: ", value.now_ab, " bb: ", value.now_bb);
      var new_ab_wei = web3.utils.toWei(value.now_ab, 'ether');
      var new_ba_wei = web3.utils.toWei(value.now_bb, 'ether');
      txs.push({
        "channel_id": key,
        "src": value.alice,
        "dst": value.bob,
        "new_ab": new_ab_wei,
        "new_ba": new_ba_wei
      })
    } 
    return txs;
  }

  genUpdateLocallyMsg() {
    var msg = "update mpc locally," + this.tpc_map.size + ",";
    for (var [key, value] of this.tpc_map) {
        msg += key.toString() + "," + value.now_ab.toString() + "," + value.now_bb.toString() + ",";
    }
    return msg;
  }

  updateLocally() {
    for (var [key, value] of this.tpc_map) {
      if (tpc_12.channel_id == key) {
        tpc_12.now_ab = value.now_ab;
        tpc_12.now_bb = value.now_bb;
      }
      else if (tpc_13.channel_id == key) {
        tpc_13.now_ab = value.now_ab;
        tpc_13.now_bb = value.now_bb;
      }
    }
  }
}

async function requestUpdateMPCLocally(mptx) {
    console.log("requestUpdateMPCLocally...");
    for (var i in mptx) {
      var tx = mptx[i]; 
      console.log("tx = ", tx);
      mpc.addTx(tx);
    }
    var msg = mpc.genUpdateLocallyMsg();
    console.log("xxxxxxxxx:");
    tpc_12.printTPC();
    tpc_13.printTPC();
    const msgHash = await web3.utils.soliditySha3(
      {t: 'string', v: msg}
    );
    var p1Sig = await TPC_OBJ.generateSignatures(msgHash, p1);
    msg += p1Sig;
    socket_12.write(msg);
    socket_13.write(msg);
}

async function requestUpdateMPC() {
  
}

async function requestCloseTPC(socket, tpc) 
{
  close_start = processMsg.uptime();
  console.log("requestCloseTPC...");
  var msg = 'close tpc,' + tpc.channel_id + ',' + tpc.version + ',';

  const prefix = "close the TPC";
  const msgHash = web3.utils.soliditySha3(
      {t: 'string', v: prefix},
      {t: 'uint256', v: tpc.channel_id},
      {t: 'uint256', v: tpc.version}
  );
  var p1Sig = await TPC_OBJ.generateSignatures(msgHash, p1);
  msg += p1Sig;
  socket.write(msg);
}


async function depositP1(channel_id, socket, tpc, p1, otherparty) { // p1, p2/p3
    console.log("depositP1: ", p1, " <--> ", otherparty);
  await mpc_contract.methods.deposit(channel_id, p1, otherparty).send({
    from: p1,
    value: init_balance_wei.toString(),
    gas: 6721975
  })
  .on('receipt', async function(receipt){
    var channel_id = -1;
    // console.log(receipt.events);

    if (receipt.events) {
      if (receipt.events.TPCOpenSuccess) {
        channel_id = receipt.events.TPCOpenSuccess.returnValues["id"];
      }
      else if(receipt.events.TPCSomeDeposit) {
        console.log("p1 deposite");
      }
    }
    // gasLogger.info('p1 deposit gasUsed: ', receipt.gasUsed);
    console.log('p1 deposit gasUsed: ', receipt.gasUsed);
    if (channel_id > 0) {
      console.log("p1 channel id : ", channel_id);
      var msg_created = "created," + channel_id.toString();
      socket.write(msg_created);
      tpc.channel_id = channel_id;
      tpc.created = true;
      tpc.version = 0;
    }
  })
  .on('error', function(error) {
      console.log("p1 deposit error: ", error);
  });
  if (tpc_12.channel_id && tpc_13.created) {
    await requestCreateMPC(socket_12, socket_13, p1, p2, p3);
  }
}


async function init() {
    var accounts = await web3.eth.getAccounts();
    p1 = accounts[1];
    p2 = accounts[2];
    p3 = accounts[3];
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

async function processMsg(msg, tpc) {
    console.log( msg.toString() );
    var msg_arr = msg.toString().split(",");
    if (msg_arr[0] == 'agree create tpc') {
        var tmp_channel_id = parseInt(msg_arr[2]);
        if (msg_arr[1] == 'p2'){
            console.log(222, "deposite with p2");
            depositP1(tmp_channel_id, socket_12, tpc_12, p1, p2);
        }
        else if (msg_arr[1] == 'p3') {
            console.log(333, "deposite with p3");
            depositP1(tmp_channel_id, socket_13, tpc_13, p1, p3);
        }
        else {
            console.log("processMsg: error otherpatry");
        }
    }
    else if (msg_arr[0] == 'created') {
        var channel_id = msg_arr[1].toString();
        console.log("created, channel id = ", channel_id);
        tpc.created = true;
        tpc.channel_id = channel_id;
        tpc.bobSig = msg_arr[2];
        if (tpc_12.channel_id && tpc_13.created) {
          await requestCreateMPC(socket_12, socket_13, p1, p2, p3);
        }
    }
    else if (msg_arr[0] == 'closed') {
        close_end = processMsg.uptime();
        var close_time = close_end - close_start;
        console.log("close TPC time: ", close_time);
        var channel_id = parseInt(msg_arr[1]);
        var version = parseInt(msg_arr[2]);
        console.log("closed channel ", channel_id, " version ", version);
    }
    else if (msg_arr[0] == 'agree create mpc') {
        await processCreateMPC(msg_arr[1], msg_arr[2]);
    }
    else if (msg_arr[0] == 'agree update mpc locally') {
      console.log(msg_arr[1] + ' agree update mpc locally');
      mpc.updateLocally();
      tpc_12.printTPC();
      tpc_13.printTPC();
    }
}

function processError(error) {
    console.log("Error: ", error);
}

(async function clientRun() {
  
    await init();

    socket_12.connect(port_12, hostname, async function(){
        // create p1 <-> p2
        await requestCreateTPC(socket_12, tpc_12, p1, p2);
    });
    socket_12.on('data', async function(msg) {
      processMsg(msg, tpc_12);
    });
    socket_12.on('error', processError);
    socket_12.on('close', function(){
        tpc_12.printTPC();
        console.log('P2下线了');
    });

    // sleep.Sleep(5);
    socket_13.connect(port_13, hostname, async function(){
        // create p1 <-> p2
        await requestCreateTPC(socket_13, tpc_13, p1, p3);
    });
    socket_13.on('data', async function(msg) {
      processMsg(msg, tpc_13);
    });
    socket_13.on('error', processError);
    socket_13.on('close',function(){
      tpc_13.printTPC();
        console.log('P3下线了');
    });
    
})();
