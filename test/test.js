var Web3 = require('web3');  // 导入web3模块
var fs = require('fs');    // fs模块读取.sol合约文件
const abi = require('ethereumjs-abi');
var TPC = require('./TPC')
var MPC = require('./MPC')
 
// 通过web3连接私有链。 (web3通过geth连接区块链中的结点)
var web3 = new Web3(new Web3.providers.WebsocketProvider("ws://localhost:8549"));  // 通过geth连接私有链中的结点。 
 
 
var tpc_contract_abi = JSON.parse(fs.readFileSync("./build/contracts_SimplePaymentChannel_sol_SimplePaymentChannel.abi"));  // 读取编译合约的abi文件。
var spc_bytecode = fs.readFileSync("./build/contracts_SimplePaymentChannel_sol_SimplePaymentChannel.bin");  // 读取编译合约的二进制文件。

var mpc_contract_abi = JSON.parse(fs.readFileSync("./build/contracts_MultipartyChannel_sol_MultipartyChannel.abi"));  // 读取编译合约的abi文件。
var spc_bytecode = fs.readFileSync("./build/contracts_MultipartyChannel_sol_MultipartyChannel.bin");  // 读取编译合约的二进制文件。

const tpc_address = '0xd500493C86664900F34CF9A6dEc23b86b5313688';
const mpc_address = '0x95050CA71d80A4e39ee529812C4d73cC255333fE';

const tpc_contract = new web3.eth.Contract(tpc_contract_abi, tpc_address);
const mpc_contract = new web3.eth.Contract(mpc_contract_abi, mpc_address);

var TPC_OBJ = new TPC(tpc_contract, web3);
var MPC_OBJ = new MPC(mpc_contract, web3);

(async function simulation() {
    var accounts = await web3.eth.getAccounts();
    console.log("accounts", accounts);
    alice = accounts[1];
    bob = accounts[2];
    carol = accounts[3];
    
    // create two simple payment channels of alice, bob and carol
    console.log("alice: ", alice, " bob: ", bob, " carol: ", carol);
    var ab_channel_id = await TPC_OBJ.createChannel(alice, bob, '10', '10');
    console.log("alice <-> bob channel_id = ", ab_channel_id);

    var bc_channel_id = await TPC_OBJ.createChannel(bob, carol, '10', '10');
    console.log("bob <-> carol channel_id = ", bc_channel_id);

    // // create mpc
    // var parties = new Array(alice, bob, carol);
    // var channels_id = new Array(ab_channel_id, bc_channel_id);
    // await createMPC(parties, channels_id);

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

    // await updateMPC(0, parties, txs1, 1);

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
    // await updateMPC(0, parties, txs2, 2);

    // // check channel balance
    // await tpc_contract.methods.getChannel(ab_channel_id)
    // .call({frome: alice}, function(error, result) {
    //     if (error) {
    //         console.log("getChannel error: ", error);
    //     }
    //     console.log("getChannel result: ", result);
    // })

    // await tpc_contract.methods.getChannel(bc_channel_id)
    // .call({frome: bob}, function(error, result) {
    //     if (error) {
    //         console.log("getChannel error: ", error);
    //     }
    //     console.log("getChannel result: ", result);
    // })

    // // // update the channel
    // var new_ab = '3';
    // var new_ba = '1';
    // version = 1;
    // await updateChannel(ab_channel_id, alice, bob, new_ab, new_ba, version);

    // // // update the channel
    // var new_bc = '1';
    // var new_cb = '3';
    // version = 1;
    // await updateChannel(bc_channel_id, bob, carol, new_bc, new_cb, version);
    
    // // close the channel
    // spc_contract.methods.closeChannel(ab_channel_id, alice, bob).send({from: alice})
    // .on('receipt', function(receipt){
    //     console.log("closeChannel recipt: ", receipt.events);
    // })
    // .on('error', function(error) {
    //     console.log("closeChannel error: ", error);
    // });

    // spc_contract.methods.closeChannel(bc_channel_id, bob, carol).send({from: bob})
    // .on('receipt', function(receipt){
    //     console.log("closeChannel recipt: ", receipt.events);
    // })
    // .on('error', function(error) {
    //     console.log("closeChannel error: ", error);
    // });

})()