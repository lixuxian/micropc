pragma solidity >=0.4.24 <0.7.0;
pragma experimental ABIEncoderV2;

import "./SimplePaymentChannel.sol";

contract MultipartyChannel {
    event CreateMPCSuccess(uint256 id, address[] parties, uint256[] channels_id);

    struct MPC {
        uint256 id;
        address[] parties;
        uint256[] channels_id;
        uint256 version_num;
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

    function updateMPC(uint256 mpc_id)
        external
    {
        // TODO
    }

    function closeMPC(uint256 mpc_id)
        external
    {
        // TODO
    }
}