rm build/contracts_*
solcjs --abi --bin contracts/SimplePaymentChannel.sol contracts/ILibSig.sol contracts/MultipartyChannel.sol
mv contracts_* build
node test/test.js