pragma solidity >=0.4.24 <0.7.0;
pragma experimental ABIEncoderV2;

import "./SimplePaymentChannel.sol";

contract MultipartyChannel {
    event CreateMPCSuccess(uint256 id, address[] parties, uint256[] channels_id);
    event UpdateMPCSuccess();
    event TransactionError(Transaction t);

    struct MPC {
        uint256 id;
        address[] parties;
        uint256[] channels_id;
        uint256 version_num;
    }

    struct Transaction {
        uint256 channel_id;
        address src;
        address dst;
        uint256 weis;
    }

    LibSig libSig = new LibSig();

    MPC mpc;
    SimplePaymentChannel spc;

    function createMPC(address spcAddr, address[] calldata parties, bytes[] calldata sigs, uint256[] calldata channels_id)
        external
        returns (uint256)
    {
        spc = SimplePaymentChannel(spcAddr);
        // verify signatures
        for (uint i = 0; i < parties.length; i++) {
            bytes32 msgHash = libSig.prefixed(keccak256(abi.encodePacked(parties[i])));
            require(libSig.verify(parties[i], msgHash, sigs[i]), "createMPC verify parties failed!");
        }
        // verify channels
        for (uint256 i = 0; i < channels_id.length; i++) {
            require(spc.verifyChannel(channels_id[i]), "createMPC verify channel failed!");
        }

        mpc.id = 0;
        mpc.parties = parties;
        mpc.channels_id = channels_id;
        mpc.version_num = 0;
        emit CreateMPCSuccess(mpc.id, parties, channels_id);
        return mpc.id;
    }

    function updateMPC(uint256 mpc_id, Transaction[] calldata txs, string calldata msgstr, uint256 version, bytes[] calldata sigs)
        external
    {
        // verify sigs
        require(mpc_id == mpc.id, "mpc id error");
        for (uint i = 0; i < mpc.parties.length; i++) {
            bytes32 msgHash = libSig.prefixed(keccak256(abi.encodePacked(msgstr, mpc.parties[i], version)));
            require(libSig.verify(mpc.parties[i], msgHash, sigs[i]), "updateMPC verify sig failed!!!");
        }
        // execute txs
        for (uint i = 0; i < txs.length; i++) {
            uint256 new_ab = 0;
            uint256 new_bb = 0;
            SimplePaymentChannel.TPC memory tpc = spc.getTPC(txs[i].channel_id);
            if (txs[i].src == tpc.alice) {
                new_ab = tpc.alice_balance - txs[i].weis;
                new_bb = tpc.bob_balance + txs[i].weis;
            } else if (txs[i].src == tpc.bob) {
                new_ab = tpc.alice_balance + txs[i].weis;
                new_bb = tpc.bob_balance - txs[i].weis;
            } else {
                emit TransactionError(txs[i]);
            }
            spc.updateBalanceInternal(txs[i].channel_id, new_ab, new_bb);
        }
        emit UpdateMPCSuccess();
    }

    function closeMPC(uint256 mpc_id)
        external
    {
        // TODO
    }
}