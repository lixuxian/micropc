rm build/contracts_*
solcjs --abi --bin contracts/ILibSig.sol contracts/MultipartyChannel.sol
mv contracts_* build
# node test/simulator.js