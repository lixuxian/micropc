var logger = require('./logger');
var gasLogger = logger.gasLogger;
var channelLogger = logger.channelLogger;
// multi-party channel
module.exports = class MPC {
    constructor (contract, web3) {
        this.mpc_contract = contract;
        this.web3 = web3;
    }

    async createMPC(parties, channels_id) {
        var sigs = new Array();
        for (var id in parties) {
            var addr = parties[id];
            const msgHash = await this.web3.utils.soliditySha3(
                {t: 'address', v: addr}
            );
            var sig = await this.generateSignatures(msgHash, addr);
            sigs.push(sig);
        }
        var mpc_id = 0;
        await this.mpc_contract.methods.createMPC(parties, sigs, channels_id)
        .send( {
            from: parties[0],
            gas: 672197500
        })
        .on('receipt', function(receipt){
            mpc_id = receipt.events.MPCCreateSuccess.returnValues["id"];
            channelLogger.info("createMPC mpc_id: ", mpc_id);
            gasLogger.info("createMPC gasUsed: ", receipt.gasUsed);
        })
        .on('error', function(error) {     
            console.log("createMPC error: ", error);
        });
        return mpc_id;
    }
    
    async updateMPC(mpc_id, parties, txs, version) {
        var msgstr = this.web3.utils.sha3(JSON.stringify(txs));
        var sigs = new Array();
        for (var id in parties) {
            var addr = parties[id];
            const msgHash = await this.web3.utils.soliditySha3(
                {t: 'string', v: msgstr},
                {t: 'address', v: addr},
                {t: 'uint256', v: version}
            );
            var sig = await this.generateSignatures(msgHash, addr);
            sigs.push(sig);
        }
    
        await this.mpc_contract.methods.updateMPC(mpc_id, txs, msgstr, version, sigs)
        .send(
            {
                from: parties[0],
                gas: 672197500
            }
        )
        .on('receipt', function(receipt){
            gasLogger.info("updateMPC gasUsed: ", receipt.gasUsed);
        })
        .on('error', function(error) {     
            console.log("updateMPC error: ", error);
        });
    }

    async generateSignatures(msgHash, addr) {
        const sig = await this.web3.eth.sign(msgHash, addr);
        return sig;
    }

    async closeMPC(mpc_id, parties, version) {
        const prefix = "close the MPC";
        const msgHash = this.web3.utils.soliditySha3(
            {t: 'string', v: prefix},
            {t: 'uint256', v: mpc_id},
            {t: 'uint256', v: version}
        );
        var sigs = new Array();
        for (var id in parties) {
            var addr = parties[id];
            var sig = await this.generateSignatures(msgHash, addr);
            sigs.push(sig);
        }

        await this.mpc_contract.methods.closeMPC(mpc_id, version, sigs)
        .send(
            {
                from: parties[0],
                gas: 672197500
            }
        )
        .on('receipt', function(receipt){
            gasLogger.info("closeMPC gasUsed: ", receipt.gasUsed);
        })
        .on('error', function(error) {     
            console.log("closeMPC error: ", error);
        });
    }
}
