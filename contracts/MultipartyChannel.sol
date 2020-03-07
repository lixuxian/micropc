pragma solidity >=0.4.24 <0.7.0;
pragma experimental ABIEncoderV2;

// import "./SimplePaymentChannel.sol";
// pragma solidity >=0.4.24 <0.7.0;
// pragma experimental ABIEncoderV2;

import "./ILibSig.sol";

contract SimplePaymentChannel {
    event TPCOpenRequest(uint256 id, address alice, address bob, uint256 ab, uint256 bb);
    event TPCOpenSuccess(uint256 id, address alice, address bob, uint256 ab, uint256 bb);
    event TPCUpdateSuccess(uint256 id, address alice, address bob, uint256 new_ab, uint256 new_bb);
    event TPCSomeDeposit(uint256 id, address addr, uint256 token);
    event TPCCloseChannel(uint256 id, address alice, address bob);

    struct TPC {
        address payable alice;
        address payable bob;
        uint256 alice_balance; // wei
        uint256 bob_balance;
        uint256 version_num;
        bool alice_deposited;
        bool bob_deposited;
        bool busy;
    }

    LibSig libSig = new LibSig();

    // TPC[] public tpc_array;
    mapping (uint256 => TPC) public tpc_map;

    uint256 count = 1;

    // TPC tpc_ab;

    function createTPC(address payable alice, address payable bob, uint256 ab, uint256 bb,
        bytes calldata sigA, bytes calldata sigB)
        external
        payable
    {
        string memory prefix = "create a TPC";
        bytes32 msgHash = libSig.prefixed(keccak256(abi.encodePacked(prefix, alice, bob, ab, bb)));
        require(msg.sender == alice || msg.sender == bob, "createTPC: wrong sender");
        require(libSig.verify(alice, msgHash, sigA) && libSig.verify(bob, msgHash, sigB), "verify failed!");

        TPC memory tpc;
        tpc.alice = alice;
        tpc.bob = bob;
        tpc.version_num = 0;
        tpc.alice_deposited = false;
        tpc.bob_deposited = false;
        tpc.busy = false;
        tpc.alice_deposited = false;
        tpc.bob_deposited = false;

        uint256 id = count;
        tpc_map[id] = tpc;
        count += 1;
        emit TPCOpenRequest(id, alice, bob, ab, bb);
    }

    function getChannel(uint256 id)
        external
        view
        returns (TPC memory)
    {
        return tpc_map[id];
    }

    function deposit(uint256 id, address alice, address bob)
        external
        payable
        returns (uint256)
    {
        //  TPC memory tpc = tpc_map[id];
        if (msg.sender == tpc_map[id].alice)
        {
            tpc_map[id].alice_balance = msg.value;
            tpc_map[id].alice_deposited = true;
            emit TPCSomeDeposit(id, alice, msg.value);
        }
        else if (msg.sender == tpc_map[id].bob)
        {
            tpc_map[id].bob_balance = msg.value;
            tpc_map[id].bob_deposited = true;
            emit TPCSomeDeposit(id, bob, msg.value);
        }
        if (tpc_map[id].alice_deposited && tpc_map[id].bob_deposited) {
            // uint256 id = count;
            // tpc_map[id] = tpc_ab;
            // count += 1;
            // tpc_ab.alice_deposited = false;
            // tpc_ab.bob_deposited = false;
            emit TPCOpenSuccess(id, alice, bob, tpc_map[id].alice_balance, tpc_map[id].bob_balance);
            return id;
        }
        return 0;
    }

    function updateTPC(
            uint256 id, address alice, address bob,
            uint256 new_ab, uint256 new_bb, uint256 version,
            bytes calldata sigA, bytes calldata sigB
        )
        external
        payable
    {
        require(tpc_map[id].busy == false, "the TPC is busy");
        require(msg.sender == alice || msg.sender == bob, "sender error");
        require((tpc_map[id].alice_balance + tpc_map[id].bob_balance) == (new_ab + new_bb), "balance error");

        bytes32 msgHash = libSig.prefixed(keccak256(abi.encodePacked(alice, bob, id, new_ab, new_bb, version)));

        require(version > tpc_map[id].version_num, "version num litter than lastest one");
        require(libSig.verify(alice, msgHash, sigA) && libSig.verify(bob, msgHash, sigB), "verify failed!");

        tpc_map[id].alice_balance = new_ab;
        tpc_map[id].bob_balance = new_bb;
        tpc_map[id].version_num = version;

        emit TPCUpdateSuccess(id, alice, bob, new_ab, new_bb);
    }

    function updateTPCInternal(uint256 id, uint256 new_ab, uint256 new_bb)
        internal
    {
        // require(tpc_map[id].alice_balance + tpc_map[id].bob_balance == new_ab + new_bb, "updateTPCInternal: amount error");
        tpc_map[id].alice_balance = new_ab;
        tpc_map[id].bob_balance = new_bb;
    }

    function closeTPC(uint256 id, uint256 version,
            bytes calldata sigA, bytes calldata sigB)
        external
        payable
    {
        TPC memory channel = tpc_map[id];
        require(msg.sender == channel.alice || msg.sender == channel.bob, "closeTPC: wrong sender");

        string memory prefix = "close the TPC";
        bytes32 msgHash = libSig.prefixed(keccak256(abi.encodePacked(prefix, id, version)));
        require(version == tpc_map[id].version_num, "closeTPC: version not equal");
        uint256 sc_version = tpc_map[id].version_num;
        require(libSig.verify(channel.alice, msgHash, sigA) && libSig.verify(channel.bob, msgHash, sigB), "verify failed!");
        // withdraw
        channel.alice.transfer(channel.alice_balance);
        channel.bob.transfer(channel.bob_balance);
        delete tpc_map[id];
        emit TPCCloseChannel(sc_version, channel.alice, channel.bob);
    }

    function verifyChannel(uint256 id)
        internal
        view
        returns (bool)
    {
        if (tpc_map[id].alice != address(0) && tpc_map[id].bob != address(0) &&
            tpc_map[id].alice_deposited == true && tpc_map[id].bob_deposited == true)
        {
            return true;
        }
        else {
            return false;
        }
    }

    function getTPC(uint256 id)
        external
        view
        returns (TPC memory)
    {
        return tpc_map[id];
    }
}

contract MultipartyChannel is SimplePaymentChannel {
    event MPCCreateSuccess(uint256 id, address[] parties, uint256[] channels_id);
    event MPCUpdateSuccess();
    event MPCTransactionError(Transaction t);
    event MPCClosed(uint256 mpc_id);

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
        uint256 new_ab;
        uint256 new_ba;
    }

    mapping (uint256 => MPC) public mpc_map;

    MPC mpc;
    uint256 mpc_count = 0;
    // SimplePaymentChannel spc;

    function createMPC(address[] calldata parties, bytes[] calldata sigs, uint256[] calldata channels_id)
        external
        returns (uint256)
    {
        // spc = SimplePaymentChannel(spcAddr);
        // verify signatures
        for (uint i = 0; i < parties.length; i++) {
            bytes32 msgHash = libSig.prefixed(keccak256(abi.encodePacked(parties[i])));
            require(libSig.verify(parties[i], msgHash, sigs[i]), "createMPC verify parties failed!");
        }
        // verify channels
        for (uint256 i = 0; i < channels_id.length; i++) {
            require(verifyChannel(channels_id[i]), "createMPC verify channel failed!");
            tpc_map[channels_id[i]].busy = true;
        }

        mpc.id = mpc_count + 1;
        mpc_count = mpc_count + 1;
        mpc.parties = parties;
        mpc.channels_id = channels_id;
        mpc.version_num = 0;
        mpc_map[mpc.id] = mpc;
        emit MPCCreateSuccess(mpc.id, parties, channels_id);
        return mpc.id;
    }

    function updateMPC(uint256 mpc_id, Transaction[] calldata txs, string calldata msgstr, uint256 version, bytes[] calldata sigs)
        external
    {
        // verify sigs
        require(mpc_map[mpc.id].version_num < version, "updateMPC: version error");
        for (uint i = 0; i < mpc_map[mpc_id].parties.length; i++) {
            bytes32 msgHash = libSig.prefixed(keccak256(abi.encodePacked(msgstr, mpc_map[mpc_id].parties[i], version)));
            require(libSig.verify(mpc_map[mpc_id].parties[i], msgHash, sigs[i]), "updateMPC: verify sig failed!!!");
        }
        for (uint i = 0; i < txs.length; i++) {
            require(tpc_map[txs[i].channel_id].alice_balance + tpc_map[txs[i].channel_id].bob_balance == txs[i].new_ab + txs[i].new_ba, "updateMPC: balance error");
        }
        // execute txs
        for (uint i = 0; i < txs.length; i++) {
            updateTPCInternal(txs[i].channel_id, txs[i].new_ab, txs[i].new_ba);
        }
        mpc_map[mpc_id].version_num = version;
        emit MPCUpdateSuccess();
    }

    function closeMPC(uint256 mpc_id, uint256 version, bytes[] calldata sigs)
        external
    {
        // require(mpc_id == mpc.id, "closeMPC: wrong id of the mpc");
        require(mpc_map[mpc_id].version_num == version, "closeMPC: wrong version");
        string memory prefix = "close the MPC";
        bytes32 msgHash = libSig.prefixed(keccak256(abi.encodePacked(prefix, mpc_id, version)));

        for (uint i = 0; i < mpc_map[mpc_id].parties.length; i++) {
            require(libSig.verify(mpc_map[mpc_id].parties[i], msgHash, sigs[i]), "closeMPC verify sig failed!!!");
        }
        delete mpc_map[mpc_id];
        emit MPCClosed(mpc_id);
    }
}