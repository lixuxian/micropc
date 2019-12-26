var logger = require('./logger');
var gasLogger = logger.gasLogger;
// var chanenlLogger = logger.chanenlLogger;
// two-party channel
module.exports = class TPC {
    constructor(contract, web3) {
        this.tpc_contract = contract;
        this.web3 = web3;
        // this.logger = logger;
    }

    async createChannel(alice, bob, ab, bb) {
        var va = this.web3.utils.toWei(ab, 'ether')
        var vb = this.web3.utils.toWei(bb, 'ether')
        // console.log("va = ", va, ", vb = ", vb);
        await this.tpc_contract.methods.openChannel(alice, bob, va, vb).send({from: alice})
        .on('receipt', function(receipt){
            // console.log("openChannel recipt : ", receipt.gasUsed);
            gasLogger.info('openChannel gasUsed: ', receipt.gasUsed);
        })
        .on('error', function(error) {
            console.log("openChannel error: ", error);
        });
    
        await this.tpc_contract.methods.deposit(alice, bob).send({
            from: alice,
            value: va.toString(),
            gas: 400000
        })
        .on('error', function(error) {
            console.log("deposit error: ", error);
        });
    
        var channel_id = 0;
        await this.tpc_contract.methods.deposit(alice, bob).send({
            from: bob,
            value: vb.toString(),
            gas: 400000
        }) 
        .on('receipt', function(receipt){
            channel_id = receipt.events.OpenSuccess.returnValues["id"];
            // console.log("createChannel recipt: ", receipt.gasUsed);
            gasLogger.info('createChannel gasUsed: ', receipt.gasUsed);
        })
        .on('error', function(error) {
            console.log("createChannel error: ", error);
        });
        return channel_id;
    }
    
    async updateChannel(channel_id, alice, bob, new_ab, new_ba, version) {
        var new_ab_wei = this.web3.utils.toWei(new_ab, 'ether');
        var new_ba_wei = this.web3.utils.toWei(new_ba, 'ether');
    
        const msgHash = this.web3.utils.soliditySha3(
            {t: 'address', v: alice},
            {t: 'address', v: bob},
            {t: 'uint256', v: channel_id},
            {t: 'uint256', v: new_ab_wei},
            {t: 'uint256', v: new_ba_wei},
            {t: 'uint256', v: version}
        );
    
        aliceSig = await this.generateSignatures(msgHash, alice);
        bobSig = await this.generateSignatures(msgHash, bob);
        console.log("sigs.alice = ", aliceSig);
        console.log("sigs.bob = ", bobSig);
            this.tpc_contract.methods.updateBalance(channel_id, alice, bob, new_ab_wei, new_ba_wei, version, aliceSig, bobSig)
            .send({
                from: alice
            }) 
            .on('receipt', function(receipt){
                console.log("updateBalance recipt: ", receipt.gasUsed);
                gasLogger.info('updateBalance gasUsed: ', receipt.gasUsed);
            })
            .on('error', function(error) {
                console.log("updateBalance error: ", error);
            });
    }

    async getChannel(channel_id) {
        await this.tpc_contract.methods.getChannel(channel_id)
        .call(function(error, result) {
            if (error) {
                console.log("getChannel error: ", error);
            }
            console.log("getChannel result: ", result);
        })
    }
    
    async generateSignatures(msgHash, addr) {
        const sig = await this.web3.eth.sign(msgHash, addr);
        return sig;
    }
}