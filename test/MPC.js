// var Web3 = require('web3');  // 导入web3模块

// Multi-party channel
module.exports = class MPC {
    constructor (contract, web3) {
        this.mpc_contract = contract;
        this.web3 = web3;
    }

    async createMPC(parties, channels_id) {
        var sigs = new Array();
        for (id in parties) {
            addr = parties[id];
            const msgHash = await this.web3.utils.soliditySha3(
                {t: 'address', v: addr}
            );
            var sig = await generateSignatures(msgHash, addr);
            sigs.push(sig);
        }
        this.mpc_contract.methods.createMPC(spc_address, parties, sigs, channels_id)
        .send( {
            from: parties[0],
            gas: 1000000
        })
        .on('receipt', function(receipt){
            mpc_id = receipt.events.CreateMPCSuccess.returnValues["id"];
            console.log("mpc_id = ", mpc_id);
            console.log("createMPC recipt: ", receipt.gasUsed);
        })
        .on('error', function(error) {     
            console.log("createMPC error: ", error);
        });
    }
    
    async updateMPC(mpc_id, parties, txs, version) {
        var msgstr = JSON.stringify(txs);
        var sigs = new Array();
        for (id in parties) {
            addr = parties[id];
            const msgHash = await this.web3.utils.soliditySha3(
                {t: 'string', v: msgstr},
                {t: 'address', v: addr},
                {t: 'uint256', v: version}
            );
            var sig = await generateSignatures(msgHash, addr);
            sigs.push(sig);
        }
    
        this.mpc_contract.methods.updateMPC(mpc_id, txs, msgstr, version, sigs)
        .send(
            {
                from: parties[0],
                gas: 1000000
            }
        )
        .on('receipt', function(receipt){
            console.log("updateMPC recipt: ", receipt.gasUsed);
        })
        .on('error', function(error) {     
            console.log("updateMPC error: ", error);
        });
    }
}

async function generateSignatures(msgHash, addr) {
    const sig = await this.web3.eth.sign(msgHash, addr);
    return sig;
}