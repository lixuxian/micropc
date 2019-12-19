pragma solidity >=0.4.24 <0.7.0;

import "./ILibSig.sol";

contract SimplePaymentChannel {
    event OpenRequest(address alice, address bob, uint256 ab, uint256 bb);
    event OpenSuccess(uint256 id, address alice, address bob, uint256 ab, uint256 bb);
    event UpdateSuccess(uint256 id, address alice, address bob, uint256 new_ab, uint256 new_bb);
    event SomeDeposit(address addr, uint256 token);
    event CloseChannel(uint256 id, address alice, address bob);

    struct TPC {
        address payable alice;
        address payable bob;
        uint256 alice_balance;
        uint256 bob_balance;
        uint256 version_num;
        bool alice_deposited;
        bool bob_deposited;
    }

    LibSig libSig = new LibSig();

    // TPC[] public tpc_array;
    mapping (uint256 => TPC) public tpc_map;

    uint256 count = 1;

    TPC tpc_ab;

    function openChannel(address payable alice, address payable bob, uint256 ab, uint256 bb)
        external
        payable
    {
        tpc_ab.alice = alice;
        tpc_ab.bob = bob;
        tpc_ab.version_num = 0;
        tpc_ab.alice_deposited = false;
        tpc_ab.bob_deposited = false;

        emit OpenRequest(alice, bob, ab, bb);
    }

    function deposit(address alice, address bob)
        external
        payable
        returns (uint256)
    {
        if (msg.sender == alice)
        {
            tpc_ab.alice_balance = msg.value;
            tpc_ab.alice_deposited = true;
            emit SomeDeposit(alice, msg.value);
        }
        else if (msg.sender == bob)
        {
            tpc_ab.bob_balance = msg.value;
            tpc_ab.bob_deposited = true;
            emit SomeDeposit(bob, msg.value);
        }
        if (tpc_ab.alice_deposited && tpc_ab.bob_deposited) {
            uint256 id = count;
            tpc_map[id] = tpc_ab;
            count += 1;
            tpc_ab.alice_deposited = false;
            tpc_ab.bob_deposited = false;
            emit OpenSuccess(id, alice, bob, tpc_ab.alice_balance, tpc_ab.bob_balance);
            return id;
        }
        return 0;
    }

    function updateBalance(
            uint256 id, address alice, address bob,
            uint256 new_ab, uint256 new_bb, uint256 version,
            bytes calldata sigA, bytes calldata sigB
        )
        external
        payable
    {
        require(msg.sender == alice || msg.sender == bob, "sender error");
        require((tpc_map[id].alice_balance + tpc_map[id].bob_balance) == (new_ab + new_bb), "balance error");

        bytes32 msgHash = libSig.prefixed(keccak256(abi.encodePacked(alice, bob, id, new_ab, new_bb, version)));

        require(version > tpc_map[id].version_num, "version num litter than lastest one");
        require(libSig.verify(alice, msgHash, sigA) && libSig.verify(bob, msgHash, sigB), "verify failed!");

        tpc_map[id].alice_balance = new_ab;
        tpc_map[id].bob_balance = new_bb;
        tpc_map[id].version_num += 1;
        emit UpdateSuccess(id, alice, bob, new_ab, new_bb);
    }

    function closeChannel(uint256 id, address payable alice, address payable bob)
        external
        payable
    {
        TPC memory channel = tpc_map[id];
        require(channel.alice == alice && channel.bob == bob, "channel error");
        require(msg.sender == alice || msg.sender == bob, "wrong sender");
        alice.transfer(channel.alice_balance);
        bob.transfer(channel.bob_balance);
        delete tpc_map[id];
        emit CloseChannel(id, alice, bob);
    }

    function verifyChannel(uint256 id)
        external
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

}