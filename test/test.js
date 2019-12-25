var Web3 = require('web3');  // 导入web3模块
var fs = require('fs');    // fs模块读取.sol合约文件
const abi = require('ethereumjs-abi');
 
// 通过web3连接私有链。 (web3通过geth连接区块链中的结点)
var web3 = new Web3(new Web3.providers.WebsocketProvider("ws://localhost:9545"));  // 通过geth连接私有链中的结点。 
 
 
var spc_contract_abi = JSON.parse(fs.readFileSync("./build/contracts_SimplePaymentChannel_sol_SimplePaymentChannel.abi"));  // 读取编译合约的abi文件。
var spc_bytecode = fs.readFileSync("./build/contracts_SimplePaymentChannel_sol_SimplePaymentChannel.bin");  // 读取编译合约的二进制文件。

var mpc_contract_abi = JSON.parse(fs.readFileSync("./build/contracts_MultipartyChannel_sol_MultipartyChannel.abi"));  // 读取编译合约的abi文件。
var spc_bytecode = fs.readFileSync("./build/contracts_MultipartyChannel_sol_MultipartyChannel.bin");  // 读取编译合约的二进制文件。

const spc_address = '0xd500493C86664900F34CF9A6dEc23b86b5313688';
const mpc_address = '0x95050CA71d80A4e39ee529812C4d73cC255333fE';

const spc_contract = new web3.eth.Contract(spc_contract_abi, spc_address);
const mpc_contract = new web3.eth.Contract(mpc_contract_abi, mpc_address);

async function createChannel(alice, bob, ab, bb) {
    var va = web3.utils.toWei(ab, 'ether')
    var vb =web3.utils.toWei(bb, 'ether')
    console.log("va = ", va, ", vb = ", vb);
    await spc_contract.methods.openChannel(alice, bob, va, vb).send({from: alice})
    .on('receipt', function(receipt){
        console.log("openChannel recipt : ", receipt.events);
    })
    .on('error', function(error) {
        console.log("openChannel error: ", error);
    });

    await spc_contract.methods.deposit(alice, bob).send({
        from: alice,
        value: va.toString(),
        gas: 400000
    })
    .on('error', function(error) {
        console.log("deposit error: ", error);
    });

    var channel_id = 0;
    await spc_contract.methods.deposit(alice, bob).send({
        from: bob,
        value: vb.toString(),
        gas: 400000
    }) 
    .on('receipt', function(receipt){
        channel_id = receipt.events.OpenSuccess.returnValues["id"];
        console.log("createChannel recipt: ", receipt.events.OpenSuccess);
    })
    .on('error', function(error) {
        console.log("createChannel error: ", error);
    });
    return channel_id;
}

async function updateChannel(channel_id, alice, bob, new_ab, new_ba, version) {
    var new_ab_wei = web3.utils.toWei(new_ab, 'ether');
    var new_ba_wei = web3.utils.toWei(new_ba, 'ether');

    const msgHash = web3.utils.soliditySha3(
        {t: 'address', v: alice},
        {t: 'address', v: bob},
        {t: 'uint256', v: channel_id},
        {t: 'uint256', v: new_ab_wei},
        {t: 'uint256', v: new_ba_wei},
        {t: 'uint256', v: version}
    );

    aliceSig = await generateSignatures(msgHash, alice);
    bobSig = await generateSignatures(msgHash, bob);
    console.log("sigs.alice = ", aliceSig);
    console.log("sigs.bob = ", bobSig);
        spc_contract.methods.updateBalance(channel_id, alice, bob, new_ab_wei, new_ba_wei, version, aliceSig, bobSig)
        .send({
            from: alice
        }) 
        .on('receipt', function(receipt){
            console.log("updateBalance recipt: ", receipt);
        })
        .on('error', function(error) {
            console.log("updateBalance error: ", error);
        });
}

async function generateSignatures(msgHash, addr) {
    const sig = await web3.eth.sign(msgHash, addr);
    return sig;
}

async function createMPC(parties, channels_id) {
    var sigs = new Array();
    for (id in parties) {
        addr = parties[id];
        const msgHash = await web3.utils.soliditySha3(
            {t: 'address', v: addr}
        );
        var sig = await generateSignatures(msgHash, addr);
        sigs.push(sig);
    }
    mpc_contract.methods.createMPC(spc_address, parties, sigs, channels_id)
    .send( {
        from: parties[0],
        gas: 1000000
    })
    .on('receipt', function(receipt){
        console.log("createMPC recipt: ", receipt.events);
    })
    .on('error', function(error) {     
        console.log("createMPC error: ", error);
    });
}

async function updateMPC(mpc_id, parties, txs, version) {
    var msgstr = JSON.stringify(txs);
    var sigs = new Array();
    for (id in parties) {
        addr = parties[id];
        const msgHash = await web3.utils.soliditySha3(
            {t: 'string', v: msgstr},
            {t: 'address', v: addr},
            {t: 'uint256', v: version}
        );
        var sig = await generateSignatures(msgHash, addr);
        sigs.push(sig);
    }

    mpc_contract.methods.updateMPC(mpc_id, txs, msgstr, version, sigs)
    .send(
        {
            from: parties[0],
            gas: 1000000
        }
    )
    .on('receipt', function(receipt){
        console.log("updateMPC recipt: ", receipt.events);
    })
    .on('error', function(error) {     
        console.log("updateMPC error: ", error);
    });
}

(async function simulation() {
    var accounts = await web3.eth.getAccounts();
    console.log("accounts", accounts);
    alice = accounts[1];
    bob = accounts[2];
    carol = accounts[3];
    
    // create two simple payment channels of alice, bob and carol
    console.log("alice: ", alice, " bob: ", bob, " carol: ", carol);
    var ab_channel_id = await createChannel(alice, bob, '2', '2');
    console.log("alice <-> bob channel_id = ", ab_channel_id);

    var bc_channel_id = await createChannel(bob, carol, '2', '2');
    console.log("bob <-> carol channel_id = ", bc_channel_id);

    // create mpc
    var parties = new Array(alice, bob, carol);
    var channels_id = new Array(ab_channel_id, bc_channel_id);
    await createMPC(parties, channels_id);

    // update MPC
    var weis = web3.utils.toWei('1', 'ether');
    var txs = [
        {
            "src": alice,
            "dst": bob,
            "weis": weis
        },
        {
            "src": bob,
            "dst": carol,
            "weis": weis
        }
    ]

    await updateMPC(0, parties, txs, 1);


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