var logger = require('./logger');
var gasLogger = logger.gasLogger;
var channelLogger = logger.channelLogger;

module.exports = class DirectedPay {

    constructor(accounts, web3) {
        this.web3 = web3;
        this.accounts = accounts;
    }

    async run (transactions) {
        for (var i in transactions) {
            var t = transactions[i];
            var src = this.accounts[t[0]];
            var dst = this.accounts[t[1]];
            var ether = t[2];
            var weis = this.web3.utils.toWei(ether, 'ether');
            await this.web3.eth.sendTransaction({
                "from": src,
                "to": dst,
                "value": weis
            })
            .on('receipt', function(receipt){
                gasLogger.info("Traditional transfer gasUsed: ", receipt.gasUsed);
            })
            .on('error', function(error) {
                console.log("Tradition run error: ", error);
            })
        }
    }
}